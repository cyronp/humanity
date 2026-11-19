import { assert, describe, it } from "@effect/vitest"
import type { SessionId, TerminalAttachEvent, TerminalOwner } from "@humanity/contracts"
import { Effect, Exit, Fiber, Stream } from "effect"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { ServerConfig } from "../src/ServerConfig.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { terminalEnvironment } from "../src/terminal/environment.ts"
import { type FakePty, makeFakePtyHost } from "../src/terminal/PtyHost.ts"
import { ATTACH_WINDOW, scanLocalUrls, TerminalService } from "../src/terminal/TerminalService.ts"
import { addProject, eventually, services, setup, waitForStatus } from "./sessionHelpers.ts"

const layerFor = (home: string, host = makeFakePtyHost()) =>
  services(home, () => [], undefined, undefined, undefined, undefined, host.layer)

const thread = (sessionId: SessionId): TerminalOwner => ({ _tag: "Session", sessionId })

const startThread = (repo: string) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const project = yield* addProject(repo)
    const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
    yield* waitForStatus(session.id, "idle")
    return session
  })

const attachTo = (terminalId: string, attachmentId = "view-1", cols = 80, rows = 24) =>
  Effect.gen(function* () {
    const terminals = yield* TerminalService
    const events: Array<TerminalAttachEvent> = []
    const fiber = yield* terminals.attach(terminalId, attachmentId, { cols, rows }).pipe(
      Stream.runForEach((event) => Effect.sync(() => events.push(event))),
      Effect.forkScoped,
    )
    yield* eventually(
      "the snapshot",
      Effect.sync(() => (events.length > 0 ? true : undefined)),
    )
    return { events, fiber }
  })

const text = (events: ReadonlyArray<TerminalAttachEvent>) =>
  events.map((event) => (event._tag === "Exited" ? "" : event.data)).join("")

const lastPty = (spawned: ReadonlyArray<FakePty>) => {
  const pty = spawned.at(-1)
  if (pty === undefined) return assert.fail("no pty was spawned")
  return pty
}

describe("TerminalService", () => {
  it.live("opens a shell in the thread's folder, without Humanity's environment", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = makeFakePtyHost()
      process.env["HUMANITY_SECRET_FOR_TEST"] = "never in a terminal"
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => delete process.env["HUMANITY_SECRET_FOR_TEST"]),
      )
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
        assert.strictEqual(terminal.state, "running")
        assert.strictEqual(terminal.cwd, session.worktreePath)
        assert.strictEqual(terminal.ordinal, 1)
        const pty = lastPty(host.spawned)
        assert.strictEqual(pty.options.cwd, session.worktreePath)
        assert.isUndefined(pty.options.env["HUMANITY_SECRET_FOR_TEST"])
        assert.strictEqual(pty.options.env["TERM"], "xterm-256color")

        const second = yield* terminals.open(thread(session.id), {
          opener: "agent",
          title: "dev server",
        })
        assert.strictEqual(second.ordinal, 2)
        const listed = yield* terminals.list(thread(session.id))
        assert.deepStrictEqual(
          listed.map((info) => [info.ordinal, info.opener, info.title]),
          [
            [1, "human", null],
            [2, "agent", "dev server"],
          ],
        )
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )

  it.live("sends the screen first, then what follows, and passes keystrokes on", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
        const pty = lastPty(host.spawned)
        pty.print("before you looked\r\n")
        yield* Effect.sleep("30 millis")

        const view = yield* attachTo(terminal.id)
        const first = view.events[0]
        assert.strictEqual(first?._tag, "Snapshot")
        assert.include(text(view.events), "before you looked")
        assert.deepStrictEqual(pty.sizes.at(-1), [80, 24])

        pty.print("after")
        yield* eventually(
          "the output",
          Effect.sync(() => (text(view.events).includes("after") ? true : undefined)),
        )
        const last = view.events.at(-1)
        assert.strictEqual(last?._tag, "Output")
        if (last?._tag === "Output") {
          assert.strictEqual(last.seq, "before you looked\r\n".length + "after".length)
        }

        yield* terminals.write(terminal.id, "ls\r")
        assert.deepStrictEqual(pty.written, ["ls\r"])
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )

  it.live("stops sending to a view that fell behind, then sends it the screen", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
        const pty = lastPty(host.spawned)
        const view = yield* attachTo(terminal.id)

        const chunk = "x".repeat(64 * 1024)
        const chunks = Math.ceil(ATTACH_WINDOW / chunk.length) + 4
        for (let index = 0; index < chunks; index++) pty.print(chunk)
        yield* Effect.sleep("50 millis")
        const sent = view.events.filter((event) => event._tag === "Output")
        const sentChars = sent.reduce((total, event) => total + event.data.length, 0)
        assert.isBelow(sentChars, chunks * chunk.length, "a view that never acks is not sent all")

        const before = view.events.length
        const lastSeq = sent.reduce((seq, event) => Math.max(seq, event.seq), 0)
        yield* terminals.ack(terminal.id, "view-1", lastSeq)
        yield* eventually(
          "a fresh snapshot",
          Effect.sync(() =>
            view.events.slice(before).some((event) => event._tag === "Snapshot") ? true : undefined,
          ),
        )
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )

  it.live("offers the local addresses its programs print, even split across chunks", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
        const pty = lastPty(host.spawned)
        pty.print("  Local:   http://local")
        pty.print("host:\x1b[1m5173\x1b[22m/\r\n  Network: http://192.168.1.5:5173/\r\n")
        const urlsOf = Effect.map(terminals.info(terminal.id), (info) =>
          info.urls.map((offer) => offer.url),
        )
        yield* eventually(
          "the address",
          Effect.map(urlsOf, (urls) => (urls.length > 0 ? urls : undefined)),
        )
        assert.deepStrictEqual(yield* urlsOf, ["http://localhost:5173/"])

        pty.print("ready on http://0.0.0.0:3000\r\nagain http://localhost:5173/\r\n")
        yield* eventually(
          "the second address",
          Effect.map(urlsOf, (urls) => (urls.length === 2 ? urls : undefined)),
        )
        assert.deepStrictEqual(yield* urlsOf, ["http://localhost:3000/", "http://localhost:5173/"])
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )

  it.live("reports the process's exit, and restarts a fresh shell", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
        const view = yield* attachTo(terminal.id)
        lastPty(host.spawned).exit(3)
        yield* eventually(
          "the exit",
          Effect.sync(() =>
            view.events.some((event) => event._tag === "Exited") ? true : undefined,
          ),
        )
        const [exited] = yield* terminals.list(thread(session.id))
        assert.strictEqual(exited?.state, "exited")
        assert.strictEqual(exited?.exitCode, 3)

        const restarted = yield* terminals.restart(terminal.id)
        assert.strictEqual(restarted.state, "running")
        assert.strictEqual(host.spawned.length, 2)
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )

  it.live("comes back after a restart with its screen, and a new shell once attached", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const first = makeFakePtyHost()
      const { sessionId, terminalId } = yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), {
          opener: "human",
          title: "server",
        })
        lastPty(first.spawned).print("worth keeping\r\n")
        yield* Effect.sleep("30 millis")
        return { sessionId: session.id, terminalId: terminal.id }
      }).pipe(Effect.provide(layerFor(home, first)), Effect.scoped)
      assert.isTrue(lastPty(first.spawned).killed, "the daemon stopping stops the shell")

      const second = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const [restored] = yield* terminals.list(thread(sessionId))
        assert.strictEqual(restored?.id, terminalId)
        assert.strictEqual(restored?.state, "restored")
        assert.strictEqual(restored?.title, "server")
        assert.strictEqual(second.spawned.length, 0, "no shell before anyone looks")

        const view = yield* attachTo(terminalId)
        assert.include(text(view.events), "worth keeping")
        assert.include(text(view.events), "new shell")
        assert.strictEqual(second.spawned.length, 1)
      }).pipe(Effect.provide(layerFor(home, second)))
    }),
  )

  it.live(
    "closes a thread's terminals and deletes their screens when it ends",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()
        const host = makeFakePtyHost()
        yield* Effect.gen(function* () {
          const terminals = yield* TerminalService
          const sessions = yield* SessionService
          const config = yield* ServerConfig
          const session = yield* startThread(repo)
          const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
          const view = yield* attachTo(terminal.id)
          lastPty(host.spawned).print("soon gone")
          yield* Effect.sleep("6 seconds")
          assert.isTrue(existsSync(join(config.terminalsDir, session.id)), "the screen was saved")

          yield* sessions.end(session.id, { removeWorktree: false })
          assert.isTrue(lastPty(host.spawned).killed)
          assert.deepStrictEqual(yield* terminals.list(thread(session.id)), [])
          assert.isFalse(existsSync(join(config.terminalsDir, session.id)))
          yield* Fiber.join(view.fiber)
          const opened = yield* Effect.exit(terminals.open(thread(session.id), { opener: "human" }))
          assert.isTrue(Exit.isFailure(opened), "an ended thread opens no terminal")
        }).pipe(Effect.provide(layerFor(home, host)))
      }),
    { timeout: 20_000 },
  )

  it.live("closing a terminal ends its views and forgets it", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const terminal = yield* terminals.open(thread(session.id), { opener: "human" })
        const view = yield* attachTo(terminal.id)
        yield* terminals.close(terminal.id)
        yield* Fiber.join(view.fiber)
        assert.isTrue(lastPty(host.spawned).killed)
        assert.deepStrictEqual(yield* terminals.list(thread(session.id)), [])
        const again = yield* Effect.exit(terminals.write(terminal.id, "x"))
        assert.isTrue(Exit.isFailure(again))
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )
})

describe("TerminalService outside a thread", () => {
  it.live("opens a project's terminals in its checkout, apart from its threads'", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const first = makeFakePtyHost()
      const { owner, terminalId } = yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const project = yield* addProject(repo)
        const owner: TerminalOwner = { _tag: "Project", projectId: project.id }
        const terminal = yield* terminals.open(owner, { opener: "human" })
        assert.deepStrictEqual(terminal.owner, owner)
        assert.strictEqual(terminal.cwd, project.localPath)
        assert.strictEqual(lastPty(first.spawned).options.cwd, project.localPath)
        lastPty(first.spawned).print("from the checkout\r\n")
        yield* Effect.sleep("30 millis")

        const sessions = yield* SessionService
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")
        assert.deepStrictEqual(
          yield* terminals.list(thread(session.id)),
          [],
          "a thread starts with none",
        )
        const own = yield* terminals.open(thread(session.id), { opener: "human" })
        assert.strictEqual(own.ordinal, 1)
        assert.deepStrictEqual(
          (yield* terminals.list(owner)).map((info) => info.id),
          [terminal.id],
          "starting a thread leaves the project's terminals where they are",
        )
        return { owner, terminalId: terminal.id }
      }).pipe(Effect.provide(layerFor(home, first)), Effect.scoped)

      const second = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const sessions = yield* SessionService
        const projects = yield* ProjectService
        const [restored] = yield* terminals.list(owner)
        assert.strictEqual(restored?.id, terminalId)
        assert.strictEqual(restored?.state, "restored")
        const view = yield* attachTo(terminalId)
        assert.include(text(view.events), "from the checkout")

        if (owner._tag !== "Project") return assert.fail("a project's terminal")
        yield* sessions.stopProject(owner.projectId)
        yield* projects.remove(owner.projectId)
        yield* Fiber.join(view.fiber)
        assert.isTrue(lastPty(second.spawned).killed, "removing the project closes them")
        const listed = yield* Effect.exit(terminals.list(owner))
        assert.isTrue(Exit.isFailure(listed), "a removed project has no terminals to list")
      }).pipe(Effect.provide(layerFor(home, second)))
    }),
  )

  it.live("opens the human's own terminals in their home folder before any project", () =>
    Effect.gen(function* () {
      const { home } = yield* setup()
      const host = makeFakePtyHost()
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const owner: TerminalOwner = { _tag: "Home" }
        const terminal = yield* terminals.open(owner, { opener: "human" })
        assert.strictEqual(terminal.cwd, homedir())
        assert.strictEqual(lastPty(host.spawned).options.cwd, homedir())
        assert.deepStrictEqual(
          (yield* terminals.list(owner)).map((info) => info.id),
          [terminal.id],
        )
      }).pipe(Effect.provide(layerFor(home, host)))
    }),
  )
})

describe("scanLocalUrls", () => {
  it("scans up to the last whitespace and carries the rest", () => {
    const first = scanLocalUrls("", "open http://localhost:30")
    assert.deepStrictEqual(first, { urls: [], carry: "http://localhost:30" })
    const second = scanLocalUrls(first.carry, "00/app now\n")
    assert.deepStrictEqual(second, { urls: ["http://localhost:3000/app"], carry: "" })
  })

  it("drops a carry that grows past its cap", () => {
    assert.strictEqual(scanLocalUrls("", "x".repeat(10_000)).carry, "")
  })
})

describe("terminalEnvironment", () => {
  it("drops PowerShell's module path on Windows, so each PowerShell builds its own", () => {
    const inherited = { PSModulePath: "C:/Users/me/Documents/PowerShell/Modules" }
    assert.isUndefined(terminalEnvironment(inherited, "win32")["PSModulePath"])
    assert.isDefined(terminalEnvironment(inherited, "linux")["PSModulePath"])
  })

  it("drops Humanity's variables and npm's, and says what the terminal can do", () => {
    const env = terminalEnvironment({
      PATH: "/usr/bin",
      HUMANITY_HOME: "/x",
      HUMANITY_PORT: "7421",
      ELECTRON_RUN_AS_NODE: "1",
      npm_config_prefix: "/somewhere",
      npm_lifecycle_event: "dev",
      CLAUDECODE: "1",
      CODEX_THREAD_ID: "t",
      LANG: "en_US.UTF-8",
    })
    assert.deepStrictEqual(env, {
      PATH: "/usr/bin",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "Humanity",
    })
  })
})
