import { assert, describe, it } from "@effect/vitest"
import {
  type SessionId,
  stripAnsi,
  type TerminalInfo,
  type TerminalOwner,
} from "@humanity/contracts"
import { Effect } from "effect"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { ServerConfig } from "../src/ServerConfig.ts"
import { SessionService } from "../src/services/SessionService.ts"
import {
  BASH_SCRIPT,
  encodePowerShell,
  POWERSHELL_SCRIPT,
  shellLaunch,
} from "../src/terminal/integration.ts"
import { folderFromOsc7, isInsideFolder, parseCommandMark } from "../src/terminal/osc.ts"
import { type FakePty, makeFakePtyHost, PtyHost } from "../src/terminal/PtyHost.ts"
import { detectShells, type Shell, shellLocateOptions } from "../src/terminal/shells.ts"
import { TerminalService } from "../src/terminal/TerminalService.ts"
import { addProject, services, setup, waitForStatus } from "./sessionHelpers.ts"

const shell = (kind: Shell["kind"], id: string = kind): Shell => ({
  id,
  kind,
  name: kind,
  path: `/bin/${kind}`,
})

describe("OSC marks", () => {
  it("reads the command marks of OSC 133", () => {
    assert.deepStrictEqual(parseCommandMark("A"), { _tag: "PromptStart" })
    assert.deepStrictEqual(parseCommandMark("C"), { _tag: "CommandStart" })
    assert.deepStrictEqual(parseCommandMark("D;0"), { _tag: "CommandEnd", exitCode: 0 })
    assert.deepStrictEqual(parseCommandMark("D;127"), { _tag: "CommandEnd", exitCode: 127 })
    assert.deepStrictEqual(parseCommandMark("D"), { _tag: "CommandEnd", exitCode: null })
    assert.deepStrictEqual(parseCommandMark("D;oops"), { _tag: "CommandEnd", exitCode: null })
    assert.isUndefined(parseCommandMark("B"))
    assert.isUndefined(parseCommandMark("P;k=v"))
  })

  it("reads the folder of OSC 7 as the platform writes it", () => {
    assert.strictEqual(folderFromOsc7("file://box/home/me/a b", "linux"), "/home/me/a b")
    assert.strictEqual(folderFromOsc7("file:///tmp", "darwin"), "/tmp")
    assert.strictEqual(folderFromOsc7("file:////tmp/a", "linux"), "/tmp/a")
    assert.strictEqual(folderFromOsc7("file://PC/C:/Users/me", "win32"), "C:\\Users\\me")
    assert.strictEqual(folderFromOsc7("file://PC/c/Users/me", "win32"), "C:\\Users\\me")
    assert.strictEqual(folderFromOsc7("file://PC/d", "win32"), "D:\\")
    assert.isUndefined(folderFromOsc7("file://PC/usr/bin", "win32"))
    assert.isUndefined(folderFromOsc7("not a url", "linux"))
  })

  it("tells whether a folder is inside another", () => {
    assert.isTrue(isInsideFolder("/repo", "/repo", "linux"))
    assert.isTrue(isInsideFolder("/repo/", "/repo/src", "linux"))
    assert.isFalse(isInsideFolder("/repo", "/repository", "linux"))
    assert.isTrue(isInsideFolder("C:\\Repo", "c:/repo/src", "win32"))
    assert.isFalse(isInsideFolder("C:\\Repo", "C:\\Other", "win32"))
  })
})

describe("shellLaunch", () => {
  const options = (platform: NodeJS.Platform) => ({
    platform,
    folder: platform === "win32" ? "C:\\Users\\me\\.humanity\\shell-integration" : "/h/si",
    env: { HOME: "/home/me" },
  })

  it("passes PowerShell its script inline, so no execution policy stops it", () => {
    const launch = shellLaunch(shell("pwsh"), options("win32"))
    assert.isTrue(launch.integrated)
    assert.deepStrictEqual(launch.args.slice(0, 3), ["-NoLogo", "-NoExit", "-EncodedCommand"])
    const encoded = launch.args[3] ?? ""
    assert.strictEqual(Buffer.from(encoded, "base64").toString("utf16le"), POWERSHELL_SCRIPT)
    assert.strictEqual(encoded, encodePowerShell(POWERSHELL_SCRIPT))
  })

  it("starts bash on its rcfile, as a login shell would load, and keeps Git Bash in its folder", () => {
    const unix = shellLaunch(shell("bash"), options("linux"))
    assert.deepStrictEqual(unix.args, ["--rcfile", "/h/si/humanity.bash", "-i"])
    assert.deepStrictEqual(unix.env, { HUMANITY_SHELL_LOGIN: "1" })
    const windows = shellLaunch(shell("bash", "git-bash"), options("win32"))
    assert.deepStrictEqual(windows.args, [
      "--rcfile",
      "C:/Users/me/.humanity/shell-integration/humanity.bash",
      "-i",
    ])
    assert.strictEqual(windows.env["CHERE_INVOKING"], "1")
  })

  it("points zsh at Humanity's ZDOTDIR, remembering the human's", () => {
    const launch = shellLaunch(shell("zsh"), {
      ...options("darwin"),
      env: { HOME: "/home/me", ZDOTDIR: "/home/me/.config/zsh" },
    })
    assert.deepStrictEqual(launch.args, ["-l"])
    assert.deepStrictEqual(launch.env, {
      ZDOTDIR: "/h/si/zsh",
      HUMANITY_USER_ZDOTDIR: "/home/me/.config/zsh",
    })
  })

  it("gives fish its script after its own configuration, and cmd none", () => {
    assert.deepStrictEqual(shellLaunch(shell("fish"), options("linux")).args, [
      "-l",
      "--init-command",
      "source '/h/si/humanity.fish'",
    ])
    assert.isFalse(shellLaunch(shell("cmd"), options("win32")).integrated)
    assert.isFalse(shellLaunch(shell("wsl"), options("win32")).integrated)
  })

  it("keeps the prompt hook out of bash's command marks", () => {
    assert.include(BASH_SCRIPT, "__humanity_prompt*) return")
    assert.include(BASH_SCRIPT, '__humanity_precmd "$status"')
    assert.include(BASH_SCRIPT, "PROMPT_COMMAND=__humanity_prompt")
  })
})

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

const until = (
  owner: TerminalOwner,
  terminalId: string,
  description: string,
  check: (info: TerminalInfo) => boolean,
  seconds = 5,
) =>
  Effect.gen(function* () {
    const terminals = yield* TerminalService
    for (let attempt = 0; attempt < seconds * 20; attempt++) {
      const info = (yield* terminals.list(owner)).find((each) => each.id === terminalId)
      if (info !== undefined && check(info)) return info
      yield* Effect.sleep("50 millis")
    }
    const last = (yield* terminals.list(owner)).find((each) => each.id === terminalId)
    return assert.fail(`timed out waiting for ${description}: ${JSON.stringify(last)}`)
  })

const osc = (payload: string) => `\x1b]${payload}\x07`
const osc7 = (folder: string) =>
  osc(`7;file://box${process.platform === "win32" ? "/" : ""}${folder.replaceAll("\\", "/")}`)

const lastPty = (spawned: ReadonlyArray<FakePty>) => {
  const pty = spawned.at(-1)
  if (pty === undefined) return assert.fail("no pty was spawned")
  return pty
}

describe("shell integration in the daemon", () => {
  it.live("writes its scripts where the shells read them", () =>
    Effect.gen(function* () {
      const { home } = yield* setup()
      yield* Effect.gen(function* () {
        yield* TerminalService
        const config = yield* ServerConfig
        for (const file of ["humanity.bash", "humanity.fish", "zsh/.zshrc", "zsh/.zshenv"]) {
          assert.isTrue(existsSync(join(config.shellIntegrationDir, file)), file)
        }
      }).pipe(Effect.provide(layerFor(home)))
    }),
  )

  it.live("follows commands, their exit codes and the folder, and keeps the folder", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const sub = join(repo, "sub")
      mkdirSync(sub)
      const host = makeFakePtyHost()
      const { owner, terminalId } = yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const session = yield* startThread(repo)
        const owner = thread(session.id)
        const terminal = yield* terminals.open(owner, { opener: "human" })
        assert.isFalse(terminal.integration)
        assert.isNull(terminal.busy)
        const pty = lastPty(host.spawned)

        pty.print(`${osc7(repo)}${osc("133;A")}$ `)
        yield* until(owner, terminal.id, "the prompt", (info) => info.integration && !info.busy)

        pty.print(`npm test\r\n${osc("133;C")}running…\r\n`)
        yield* until(owner, terminal.id, "the command", (info) => info.busy === true)

        pty.print(`${osc("133;D;3")}${osc7(sub)}${osc("133;A")}$ `)
        const ended = yield* until(owner, terminal.id, "the end", (info) => info.busy === false)
        assert.strictEqual(ended.lastExitCode, 3)
        assert.isTrue(isInsideFolder(sub, ended.cwd, process.platform), ended.cwd)
        yield* Effect.sleep("1500 millis")
        return { owner, terminalId: terminal.id }
      }).pipe(Effect.provide(layerFor(home, host)), Effect.scoped)

      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const [restored] = yield* terminals.list(owner)
        assert.strictEqual(restored?.id, terminalId)
        assert.isTrue(isInsideFolder(sub, restored?.cwd ?? "", process.platform), "kept the folder")
      }).pipe(Effect.provide(layerFor(home)))
    }),
  )

  it.live(
    "moves idle terminals to the worktree and leaves a busy one in the checkout",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()
        const host = makeFakePtyHost()
        yield* Effect.gen(function* () {
          const terminals = yield* TerminalService
          const sessions = yield* SessionService
          const session = yield* startThread(repo)
          const owner = thread(session.id)

          const idle = yield* terminals.open(owner, { opener: "human" })
          lastPty(host.spawned).print(osc("133;A"))
          const busy = yield* terminals.open(owner, { opener: "human" })
          lastPty(host.spawned).print(`${osc("133;A")}${osc("133;C")}`)
          const plain = yield* terminals.open(owner, { opener: "human" })
          yield* until(owner, idle.id, "the idle prompt", (info) => info.busy === false)
          yield* until(owner, busy.id, "the busy command", (info) => info.busy === true)
          const spawnedBefore = host.spawned.length

          const moved = yield* sessions.setupWorktree(session.id)
          assert.isTrue(moved.inWorktree)

          const after = yield* terminals.list(owner)
          const byId = (id: string) => after.find((info) => info.id === id)
          assert.strictEqual(byId(idle.id)?.location, "folder")
          assert.strictEqual(byId(idle.id)?.cwd, moved.worktreePath)
          assert.strictEqual(host.spawned.length, spawnedBefore + 1, "only the idle one restarted")
          assert.strictEqual(lastPty(host.spawned).options.cwd, moved.worktreePath)
          assert.strictEqual(byId(busy.id)?.location, "checkout")
          assert.strictEqual(byId(busy.id)?.cwd, repo)
          assert.strictEqual(byId(plain.id)?.location, "checkout", "no integration: kept")
        }).pipe(Effect.provide(layerFor(home, host)))
      }),
    { timeout: 30_000 },
  )
})

const realShells = detectShells(shellLocateOptions()).filter(
  (each) => each.kind !== "cmd" && each.kind !== "wsl" && each.kind !== "sh",
)

const failWith3 = (each: Shell) =>
  process.platform === "win32" && (each.kind === "pwsh" || each.kind === "powershell")
    ? "cmd /c exit 3"
    : "sh -c 'exit 3'"

const realBash = realShells.find((each) => each.kind === "bash")

describe.skipIf(realBash === undefined)("bash's own PROMPT_COMMAND", () => {
  it.live(
    "runs inside Humanity's prompt hook, as an array too, and sees the last exit code",
    () =>
      Effect.gen(function* () {
        const bash = realBash as Shell
        const home = mkdtempSync(join(tmpdir(), "humanity-bash-"))
        writeFileSync(
          join(home, ".bashrc"),
          "PROMPT_COMMAND=('echo first=$?' '' 'echo second=$?')\nPS1='$ '\n",
        )
        const rcfile = join(home, "humanity.bash")
        writeFileSync(rcfile, BASH_SCRIPT)
        const env: Record<string, string> = { ...(process.env as Record<string, string>) }
        delete env["PROMPT_COMMAND"]
        delete env["HUMANITY_SHELL_LOGIN"]
        const host = yield* PtyHost
        const pty = yield* host.spawn({
          file: bash.path,
          args: ["--rcfile", rcfile.replaceAll("\\", "/"), "-i"],
          cwd: home,
          env: { ...env, HOME: home },
          cols: 120,
          rows: 30,
        })
        let output = ""
        pty.onData((data) => {
          output += data
        })
        const marks = () =>
          // eslint-disable-next-line no-control-regex
          [...output.matchAll(/\x1b\]133;([^\x07]*)\x07/g)].map((m) => m[1])
        const text = () => stripAnsi(output)
        const waitFor = (description: string, check: () => boolean) =>
          Effect.gen(function* () {
            for (let attempt = 0; attempt < 800; attempt++) {
              if (check()) return
              yield* Effect.sleep("50 millis")
            }
            assert.fail(
              `timed out waiting for ${description}: marks ${marks().join(" ")}; text ${JSON.stringify(text().slice(-400))}`,
            )
          })

        yield* waitFor("the first prompt", () => marks().includes("A"))
        pty.write("sh -c 'exit 3'\r")
        yield* waitFor("the prompt's own commands", () => /second=3(?!\d)/.test(text()))
        pty.kill()
        assert.deepStrictEqual(marks(), ["A", "C", "D;3", "A"])
        assert.match(text(), /first=3(?!\d)/)
      }).pipe(Effect.provide(PtyHost.layer)),
    { timeout: 90_000 },
  )
})

describe.skipIf(realShells.length === 0)("shell integration in a real shell", () => {
  for (const realShell of realShells) {
    it.live(
      `${realShell.name} reports its commands, exit codes and folder`,
      () =>
        Effect.gen(function* () {
          const { home, repo } = yield* setup()
          yield* Effect.gen(function* () {
            const terminals = yield* TerminalService
            const session = yield* startThread(repo)
            const owner = thread(session.id)
            const terminal = yield* terminals.open(owner, { opener: "human", shell: realShell.id })
            yield* until(owner, terminal.id, "the first prompt", (info) => info.integration, 30)

            yield* terminals.write(terminal.id, `${failWith3(realShell)}\r`)
            const ended = yield* until(
              owner,
              terminal.id,
              "the failing command",
              (info) => info.lastExitCode === 3 && info.busy === false,
              20,
            )
            assert.strictEqual(ended.lastExitCode, 3)

            const cursor = yield* terminals.agentCursor(terminal.id)
            yield* terminals.agentWrite(terminal.id, "echo humanity-check\r")
            const waited = yield* terminals.agentWait(terminal.id, {
              for: { _tag: "command" },
              since: cursor,
              timeoutMs: 20_000,
              maxLines: 50,
            })
            assert.strictEqual(waited.outcome, "command")
            assert.strictEqual(waited.exitCode, 0)
            assert.match(waited.text, /^humanity-check$/m, waited.text)
            const screen = yield* terminals.agentRead(terminal.id, {
              view: "screen",
              since: undefined,
              maxLines: 50,
            })
            assert.include(screen.text, "humanity-check")

            yield* terminals.write(terminal.id, "cd ..\r")
            const moved = yield* until(
              owner,
              terminal.id,
              "the new folder",
              (info) => !isInsideFolder(repo, info.cwd, process.platform),
              20,
            )
            assert.isTrue(isInsideFolder(dirname(repo), moved.cwd, process.platform), moved.cwd)
            yield* terminals.close(terminal.id)
          }).pipe(
            Effect.provide(
              services(home, () => [], undefined, undefined, undefined, undefined, PtyHost.layer),
            ),
          )
        }),
      { timeout: 90_000 },
    )
  }
})
