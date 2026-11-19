import { assert, describe, it } from "@effect/vitest"
import type { SessionId } from "@humanity/contracts"
import { Effect, Exit, Layer } from "effect"
import { mkdirSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { PreviewFiles } from "../src/preview/PreviewFiles.ts"
import { type CommandResult, PreviewService } from "../src/preview/PreviewService.ts"
import { makeFakePtyHost } from "../src/terminal/PtyHost.ts"
import { TerminalService } from "../src/terminal/TerminalService.ts"
import { addProject, services, setup, waitForStatus } from "./sessionHelpers.ts"
import { SessionService } from "../src/services/SessionService.ts"

interface Machine {
  netstat: string
  processes: string
  answering: Set<number>
  ran: Array<ReadonlyArray<string>>
}

const layerFor = (home: string, machine: Machine) =>
  PreviewService.layer({
    platform: "win32",
    run: (command, args) =>
      Effect.sync((): CommandResult => {
        machine.ran.push([command, ...args])
        if (command === "netstat") {
          return { stdout: args.includes("TCPv6") ? "" : machine.netstat, exitCode: 0 }
        }
        if (command === "powershell.exe") return { stdout: machine.processes, exitCode: 0 }
        return { stdout: "", exitCode: 0 }
      }),
    answersHttp: (url) => Effect.succeed(machine.answering.has(Number(new URL(url).port))),
  }).pipe(
    Layer.provideMerge(
      services(home, () => [], undefined, undefined, undefined, undefined, makeFakePtyHost().layer),
    ),
  )

const startThread = (repo: string) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const project = yield* addProject(repo)
    const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
    yield* waitForStatus(session.id, "idle")
    return session
  })

const listen = (handler: Parameters<typeof createServer>[1]) =>
  Effect.acquireRelease(
    Effect.callback<Server>((resume) => {
      const server = createServer(handler)
      server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)))
    }),
    (server) => Effect.callback<void>((resume) => void server.close(() => resume(Effect.void))),
  ).pipe(Effect.map((server) => (server.address() as AddressInfo).port))

const row = (address: string, pid: number) =>
  `  TCP    ${address}         0.0.0.0:0              LISTENING       ${pid}`

describe("PreviewService", () => {
  it.live("lists the local servers that answer HTTP, tied to the terminal that started them", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const machine: Machine = { netstat: "", processes: "", answering: new Set(), ran: [] }
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const preview = yield* PreviewService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(
          { _tag: "Session", sessionId: session.id },
          { opener: "human" },
        )
        const [shellPid] = [...(yield* terminals.processIds).keys()]
        assert.isDefined(shellPid)
        machine.netstat = [
          row("127.0.0.1:5173", 2000),
          row("0.0.0.0:135", 1520),
          row("127.0.0.1:7420", 3000),
          row("0.0.0.0:8000", 42),
        ].join("\r\n")
        machine.processes = [
          `${shellPid} 1 pwsh.exe`,
          `2000 ${shellPid} node.exe`,
          "42 1 python.exe",
          "1520 1 svchost.exe",
        ].join("\r\n")
        machine.answering = new Set([5173, 8000, 7420])

        const servers = yield* preview.scan
        assert.deepStrictEqual(servers, [
          {
            port: 5173,
            url: "http://localhost:5173/",
            pid: 2000,
            processName: "node.exe",
            terminalId: terminal.id,
          },
          {
            port: 8000,
            url: "http://localhost:8000/",
            pid: 42,
            processName: "python.exe",
            terminalId: null,
          },
        ])

        const unknown = yield* Effect.exit(preview.stopServer(1520, 135))
        assert.isTrue(Exit.isFailure(unknown))
        yield* preview.stopServer(42, 8000)
        assert.deepStrictEqual(machine.ran.at(-1), ["taskkill", "/PID", "42", "/T", "/F"])
      }).pipe(Effect.provide(layerFor(home, machine)))
    }),
  )

  it.live("says why a framed page stays blank", () =>
    Effect.gen(function* () {
      const { home } = yield* setup()
      const machine: Machine = { netstat: "", processes: "", answering: new Set(), ran: [] }
      yield* Effect.gen(function* () {
        const preview = yield* PreviewService
        const app = "http://127.0.0.1:7420"
        const open = yield* listen((_, response) => response.end("hi"))
        const denies = yield* listen((_, response) => {
          response.setHeader("x-frame-options", "DENY")
          response.end("no")
        })
        const closed = yield* listen((_, response) => response.end())
        assert.deepStrictEqual(yield* preview.probe(`http://localhost:${open}/`, app), {
          _tag: "Ok",
          status: 200,
        })
        assert.strictEqual(
          (yield* preview.probe(`http://127.0.0.1:${denies}/`, app))._tag,
          "Refuses",
        )
        assert.strictEqual((yield* preview.probe("http://192.168.1.5/", app))._tag, "Unreachable")
        assert.strictEqual((yield* preview.probe(`http://127.0.0.1:7420/`, app))._tag, "Refuses")
        void closed
      }).pipe(Effect.scoped, Effect.provide(layerFor(home, machine)))
    }),
  )
})

describe("PreviewFiles", () => {
  it.live("serves a thread's HTML file and what it loads, and nothing outside its folder", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const machine: Machine = { netstat: "", processes: "", answering: new Set(), ran: [] }
      yield* Effect.gen(function* () {
        const files = yield* PreviewFiles
        const session = yield* startThread(repo)
        mkdirSync(join(session.worktreePath, "site"), { recursive: true })
        writeFileSync(join(session.worktreePath, "site", "index.html"), "<link href=a.css>")
        writeFileSync(join(session.worktreePath, "site", "a.css"), "body{}")
        writeFileSync(join(home, "secret.html"), "secret")

        const url = yield* files.urlFor(session.id, "site/index.html")
        const page = yield* Effect.promise(() => fetch(url))
        assert.strictEqual(page.status, 200)
        assert.strictEqual(page.headers.get("content-type"), "text/html; charset=utf-8")
        assert.strictEqual(yield* Effect.promise(() => page.text()), "<link href=a.css>")
        const css = yield* Effect.promise(() => fetch(new URL("a.css", url)))
        assert.strictEqual(css.headers.get("content-type"), "text/css; charset=utf-8")

        const absolute = yield* files.urlFor(
          session.id,
          join(session.worktreePath, "site", "index.html"),
        )
        assert.strictEqual(absolute, url)

        const token = new URL(url).pathname.split("/")[1]
        const base = `http://127.0.0.1:${files.port}`
        for (const path of [
          `/${token}/..%2F..%2Fsecret.html`,
          `/${token}/../secret.html`,
          "/nope/site/index.html",
          `/${token}/`,
        ]) {
          const response = yield* Effect.promise(() => fetch(base + path))
          assert.strictEqual(response.status, 404, path)
        }

        assert.isTrue(Exit.isFailure(yield* Effect.exit(files.urlFor(session.id, "site/a.css"))))
        assert.isTrue(
          Exit.isFailure(yield* Effect.exit(files.urlFor(session.id, join(home, "secret.html")))),
        )
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(files.urlFor("missing" as SessionId, "site/index.html")),
          ),
        )
      }).pipe(Effect.provide(layerFor(home, machine)))
    }),
  )

  it.live("never serves a dotfile or what a dot folder holds", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const machine: Machine = { netstat: "", processes: "", answering: new Set(), ran: [] }
      yield* Effect.gen(function* () {
        const files = yield* PreviewFiles
        const session = yield* startThread(repo)
        const folder = session.worktreePath
        mkdirSync(join(folder, ".hidden"), { recursive: true })
        writeFileSync(join(folder, "index.html"), "<p>hi</p>")
        writeFileSync(join(folder, ".env"), "TOKEN=secret")
        writeFileSync(join(folder, ".hidden", "page.html"), "hidden")

        const url = yield* files.urlFor(session.id, "index.html")
        for (const path of [".env", ".git/config", ".git%2Fconfig", ".hidden/page.html"]) {
          const response = yield* Effect.promise(() => fetch(new URL(path, url)))
          assert.strictEqual(response.status, 404, path)
        }
        assert.isTrue(
          Exit.isFailure(yield* Effect.exit(files.urlFor(session.id, ".hidden/page.html"))),
        )
      }).pipe(Effect.provide(layerFor(home, machine)))
    }),
  )

  it.live("forgets a thread's address once the thread has ended", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const machine: Machine = { netstat: "", processes: "", answering: new Set(), ran: [] }
      yield* Effect.gen(function* () {
        const files = yield* PreviewFiles
        const sessions = yield* SessionService
        const session = yield* startThread(repo)
        writeFileSync(join(session.worktreePath, "index.html"), "<p>hi</p>")

        const url = yield* files.urlFor(session.id, "index.html")
        assert.strictEqual((yield* Effect.promise(() => fetch(url))).status, 200)

        yield* sessions.end(session.id, { removeWorktree: false })
        assert.strictEqual((yield* Effect.promise(() => fetch(url))).status, 404)
        assert.isTrue(Exit.isFailure(yield* Effect.exit(files.urlFor(session.id, "index.html"))))
      }).pipe(Effect.provide(layerFor(home, machine)))
    }),
  )
})
