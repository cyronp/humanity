import { assert, describe, it } from "@effect/vitest"
import {
  type Approval,
  ProjectId,
  type SessionId,
  type TerminalOwner,
  humanityTool,
} from "@humanity/contracts"
import { Effect } from "effect"
import type { FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { answerMcp, type HumanityTools } from "../src/mcp/HumanityMcp.ts"
import { ApprovalService } from "../src/services/ApprovalService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { keySequence, typedCommand } from "../src/terminal/agentTools.ts"
import { type FakePty, makeFakePtyHost } from "../src/terminal/PtyHost.ts"
import { TerminalService } from "../src/terminal/TerminalService.ts"
import {
  addProject,
  contents,
  eventually,
  services,
  setup,
  waitForStatus,
} from "./sessionHelpers.ts"

describe("keys the agent types", () => {
  it("knows the usual keys and every Ctrl+letter", () => {
    assert.strictEqual(keySequence("enter"), "\r")
    assert.strictEqual(keySequence("Tab"), "\t")
    assert.strictEqual(keySequence("up"), "\x1b[A")
    assert.strictEqual(keySequence("ctrl+c"), "\x03")
    assert.strictEqual(keySequence("Ctrl+D"), "\x04")
    assert.strictEqual(keySequence("^z"), "\x1a")
    assert.isUndefined(keySequence("hyper+q"))
  })

  it("shows the human what will be typed", () => {
    assert.strictEqual(typedCommand("npm run dev", []), "npm run dev")
    assert.strictEqual(typedCommand("", ["ctrl+c"]), "[ctrl+c]")
    assert.strictEqual(typedCommand("y", ["Enter"]), "y [enter]")
  })
})

describe("Humanity's MCP server", () => {
  const tools: HumanityTools = {
    openThread: () => Effect.die("not called"),
    terminal: (tool, args) =>
      Effect.succeed({
        text: `${tool} ${JSON.stringify(args)}`,
        isError: tool === "terminal_close",
      }),
  }
  const call = (name: string, args: unknown) => ({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name, arguments: args },
  })

  it.effect("lists the terminal tools after open_thread", () =>
    Effect.gen(function* () {
      const listed = yield* answerMcp(tools, { jsonrpc: "2.0", id: 1, method: "tools/list" })
      const listedTools = (
        listed.body as {
          result: { tools: ReadonlyArray<{ name: string; _meta?: Record<string, unknown> }> }
        }
      ).result.tools
      const names = listedTools.map((tool) => tool.name)
      for (const tool of listedTools) {
        assert.isTrue(tool._meta?.["anthropic/alwaysLoad"], `${tool.name} is always loaded`)
      }
      assert.deepStrictEqual(names, [
        "open_thread",
        "terminal_list",
        "terminal_read",
        "terminal_send",
        "terminal_wait",
        "terminal_open",
        "terminal_close",
      ])
    }),
  )

  it.effect("hands a terminal tool's call to the thread's tools, with its arguments", () =>
    Effect.gen(function* () {
      const sent = yield* answerMcp(tools, call("terminal_send", { terminal: "1", text: "ls" }))
      assert.deepStrictEqual((sent.body as { result: unknown }).result, {
        content: [{ type: "text", text: 'terminal_send {"terminal":"1","text":"ls"}' }],
      })
      const closed = yield* answerMcp(tools, call("terminal_close", { terminal: "1" }))
      assert.isTrue((closed.body as { result: { isError?: boolean } }).result.isError)
    }),
  )
})

// The tools in a thread ------------------------------------------------------------------------

const osc = (payload: string) => `\x1b]${payload}\x07`

/** A pretend shell: a prompt with its marks, and `echo <text>` / `fail` as commands. */
const fakeShell = () =>
  makeFakePtyHost({
    // Once the daemon listens to it, as a real shell prints after it started.
    onSpawn: (pty) => void setTimeout(() => pty.print(`${osc("133;A")}$ `), 0),
    onWrite: (pty, data) => {
      if (!data.endsWith("\r")) return
      const command = data.slice(0, -1)
      const output = command.startsWith("echo ") ? `${command.slice(5)}\r\n` : ""
      const code = command === "fail" ? 3 : 0
      pty.print(`${command}\r\n${osc("133;C")}${output}${osc(`133;D;${code}`)}${osc("133;A")}$ `)
    },
  })

const ownTerminals = (sessionId: SessionId): TerminalOwner => ({ _tag: "Session", sessionId })

const startThread = (repo: string, prompt: string, autonomy: "ask" | "auto") =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const project = yield* addProject(repo)
    const session = yield* sessions.create({ projectId: project.id, prompt, autonomy })
    return { project, session }
  })

const results = (sessionId: string) =>
  Effect.map(contents(sessionId), (snapshot) =>
    snapshot.toolCalls.map((call) => ({
      tool: call.toolName,
      status: call.status,
      text: call.output?.content ?? "",
    })),
  )

const pendingConfirmation = (sessionId: string) =>
  eventually(
    "a pending confirmation",
    Effect.map(contents(sessionId), (snapshot) => {
      const found = snapshot.approvals.find(
        (approval): approval is Extract<Approval, { _tag: "confirmation" }> =>
          approval._tag === "confirmation" && approval.confirmation.status === "pending",
      )
      return found?.confirmation
    }),
  )

const lastPty = (spawned: ReadonlyArray<FakePty>) => {
  const pty = spawned.at(-1)
  if (pty === undefined) return assert.fail("no pty was spawned")
  return pty
}

describe("the agent's terminal tools", () => {
  it.live("open a terminal running a command, type in it, wait and read, in Auto mode", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = fakeShell()
      const script: FakeScript = () => [
        { tool: humanityTool("terminal_open"), input: { title: "server", command: "echo ready" } },
        { tool: humanityTool("terminal_send"), input: { terminal: "1", text: "fail" } },
        {
          tool: humanityTool("terminal_wait"),
          input: { terminal: "1", for: "command", since: "2" },
        },
        { tool: humanityTool("terminal_read"), input: { terminal: "#1", view: "screen" } },
        { tool: humanityTool("terminal_list"), input: {} },
        { tool: humanityTool("terminal_close"), input: { terminal: "1" } },
      ]
      yield* Effect.gen(function* () {
        const { session } = yield* startThread(repo, "work", "auto")
        yield* waitForStatus(session.id, "idle")
        const [opened, sent, waited, read, listed, closed] = yield* results(session.id)

        assert.include(opened?.text, "Opened terminal #1 and ran `echo ready`")
        assert.strictEqual(opened?.status, "succeeded")
        const pty = lastPty(host.spawned)
        assert.deepStrictEqual(pty.written, ["echo ready\r", "fail\r"])

        assert.include(sent?.text, "Typed into terminal #1. [cursor: 2]")
        assert.include(waited?.text, "The command ended with exit code 3.")
        assert.include(read?.text, "ready")
        assert.include(listed?.text, '#1 "server"')
        assert.include(listed?.text, "opened by you")
        assert.include(listed?.text, "the last command exited with 3")
        assert.strictEqual(closed?.text, "Closed terminal #1.")
        assert.isTrue(pty.killed)
      }).pipe(
        Effect.provide(
          services(home, script, undefined, undefined, undefined, undefined, host.layer),
        ),
      )
    }),
  )

  it.live(
    "in a thread that asks, type nothing until the human allows it, as Bash",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()
        const host = fakeShell()
        const script: FakeScript = (prompt) =>
          prompt === "type"
            ? [
                { tool: humanityTool("terminal_send"), input: { terminal: "1", text: "echo hi" } },
                { tool: humanityTool("terminal_send"), input: { terminal: "1", keys: ["ctrl+c"] } },
              ]
            : []
        yield* Effect.gen(function* () {
          const terminals = yield* TerminalService
          const approvals = yield* ApprovalService
          const sessions = yield* SessionService
          const { session } = yield* startThread(repo, "hello", "ask")
          yield* waitForStatus(session.id, "idle")
          yield* terminals.open(ownTerminals(session.id), { opener: "human" })
          const pty = lastPty(host.spawned)

          yield* sessions.sendMessage(session.id, "type")
          const first = yield* pendingConfirmation(session.id)
          yield* waitForStatus(session.id, "waiting_for_human")
          assert.strictEqual(first.toolName, "Bash")
          assert.deepStrictEqual(first.input, {
            command: "echo hi",
            description: 'Typed into terminal #1 "' + repo.split(/[\\/]/).at(-1) + '", then Enter',
          })
          assert.deepStrictEqual(pty.written, [], "nothing typed before the human decides")
          yield* approvals.decideConfirmation(first.id, { decision: "allow" })

          const second = yield* eventually(
            "the second confirmation",
            Effect.map(pendingConfirmation(session.id), (each) =>
              each.id === first.id ? undefined : each,
            ),
          )
          assert.strictEqual((second.input as { command: string }).command, "[ctrl+c]")
          yield* approvals.decideConfirmation(second.id, {
            decision: "deny",
            comment: "Leave it running.",
          })
          yield* waitForStatus(session.id, "idle")

          assert.deepStrictEqual(pty.written, ["echo hi\r"])
          const [, denied] = yield* results(session.id)
          assert.strictEqual(denied?.status, "failed")
          assert.include(denied?.text, "Nothing was typed.")
          assert.include(denied?.text, "Leave it running.")
        }).pipe(
          Effect.provide(
            services(home, script, undefined, undefined, undefined, undefined, host.layer),
          ),
        )
      }),
    { timeout: 30_000 },
  )

  it.live("close the agent's own terminals without asking, and see only the thread's", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const host = fakeShell()
      const script: FakeScript = (prompt) =>
        prompt === "tidy"
          ? [
              { tool: humanityTool("terminal_list"), input: {} },
              { tool: humanityTool("terminal_open"), input: {} },
              { tool: humanityTool("terminal_close"), input: { terminal: "1" } },
              { tool: humanityTool("terminal_read"), input: { terminal: "1" } },
            ]
          : []
      yield* Effect.gen(function* () {
        const terminals = yield* TerminalService
        const sessions = yield* SessionService
        const { project, session } = yield* startThread(repo, "hello", "ask")
        yield* waitForStatus(session.id, "idle")
        // The project's own terminal, on the new-thread page: no agent ever sees it.
        yield* terminals.open(
          { _tag: "Project", projectId: ProjectId.make(project.id) },
          {
            opener: "human",
          },
        )

        yield* sessions.sendMessage(session.id, "tidy")
        yield* waitForStatus(session.id, "idle")
        const [listed, opened, closed, gone] = yield* results(session.id)
        assert.include(listed?.text, "This thread has no terminal.")
        assert.include(opened?.text, "Opened terminal #1.")
        assert.strictEqual(closed?.text, "Closed terminal #1.")
        assert.include(gone?.text, "No terminal 1 in this thread.")
        const asked = (yield* contents(session.id)).approvals
        assert.lengthOf(asked, 0, "nothing was asked")
      }).pipe(
        Effect.provide(
          services(home, script, undefined, undefined, undefined, undefined, host.layer),
        ),
      )
    }),
  )
})
