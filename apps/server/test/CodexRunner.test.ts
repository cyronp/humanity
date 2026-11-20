import { assert, describe, it } from "@effect/vitest"
import { type Cause, Effect, Queue, Stream } from "effect"
import type {
  AgentRunOptions,
  PermissionDecision,
  ToolPermissionRequest,
} from "../src/agent/AgentRunner.ts"
import { type CodexConnect, startCodexRun } from "../src/agent/CodexRunner.ts"
import { CODEX_READY } from "../src/agent/normalizeCodex.ts"
import { CodexFailed, type ServerMessage, type ServerReply } from "../src/codex/AppServer.ts"
import { eventually } from "./sessionHelpers.ts"

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

const fakeCodex = Effect.gen(function* () {
  const notifications = yield* Queue.unbounded<ServerMessage, CodexFailed | Cause.Done>()
  const calls: Array<Call> = []
  let onRequest: ((request: ServerMessage) => Effect.Effect<ServerReply, CodexFailed>) | undefined
  let turns = 0

  const answers: Record<string, () => unknown> = {
    "config/read": () => ({ config: { mcp_servers: { figma: { url: "https://mcp.figma.com" } } } }),
    "thread/start": () => ({ thread: { id: "thread-1" }, model: "gpt-test" }),
    "thread/resume": () => ({ thread: { id: "thread-1" }, model: "gpt-test" }),
    "turn/start": () => ({ turn: { id: `turn-${++turns}` } }),
  }

  const connect: CodexConnect = (options) =>
    Effect.sync(() => {
      onRequest = options.onRequest
      return {
        cliVersion: "0.0.0",
        codexHome: undefined,
        notifications: Stream.fromQueue(notifications),
        request: (method, params) =>
          Effect.sync(() => {
            calls.push({ method, params: (params ?? {}) as Record<string, unknown> })
            return answers[method]?.() ?? {}
          }),
      }
    })

  return {
    connect,
    calls,
    called: (method: string) => calls.filter((call) => call.method === method),
    notify: (method: string, params: Record<string, unknown>) =>
      Queue.offer(notifications, { method, params: { threadId: "thread-1", ...params } }),
    ask: (method: string, params: Record<string, unknown>) =>
      Effect.suspend(() => {
        if (onRequest === undefined) return Effect.die("Codex is not connected yet")
        return onRequest({ method, params: { threadId: "thread-1", ...params } })
      }),
    endTurn: (id: string, status = "completed") =>
      Queue.offer(notifications, {
        method: "turn/completed",
        params: { threadId: "thread-1", turn: { id, status, error: null, durationMs: 5 } },
      }),
  }
})

const runOptions = (
  canUseTool: (request: ToolPermissionRequest) => PermissionDecision,
  overrides: Partial<AgentRunOptions> = {},
): AgentRunOptions => ({
  provider: "codex",
  cwd: "/work/repo",
  configDir: undefined,
  resume: undefined,
  model: undefined,
  effort: undefined,
  extensions: { mcpServers: {}, plugins: [] },
  allowedTools: [],
  offersOpenThread: true,
  canUseTool: (request) => Effect.sync(() => canUseTool(request)),
  ...overrides,
})

const allow = (): PermissionDecision => ({ behavior: "allow" })

const waitFor =
  (codex: { readonly called: (method: string) => ReadonlyArray<Call> }) =>
  (method: string, count = 1) =>
    eventually(
      `${count} × ${method}`,
      Effect.sync(() => {
        const found = codex.called(method)
        return found.length >= count ? found[count - 1] : undefined
      }),
    )

describe("a Codex run", () => {
  it.live("opens a thread that asks Humanity before commands and file changes", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const run = yield* startCodexRun(codex.connect)(
        runOptions(allow, {
          model: "gpt-test",
          effort: "high",
          extensions: {
            mcpServers: {
              docs: { type: "stdio", command: "docs-mcp", args: ["--stdio"], env: { A: "1" } },
              humanity: {
                type: "http",
                url: "http://127.0.0.1:7420/mcp",
                headers: { Authorization: "Bearer thread-token" },
                timeoutMs: 86_400_000,
              },
            },
            plugins: [],
          },
        }),
      )
      yield* run.send({ text: "Fix the bug", attachments: [] })
      const turn = yield* waitFor(codex)("turn/start")

      const thread = codex.called("thread/start")[0]?.params
      assert.strictEqual(thread?.["cwd"], "/work/repo")
      assert.strictEqual(thread?.["approvalPolicy"], "untrusted")
      assert.strictEqual(thread?.["approvalsReviewer"], "user")
      assert.deepStrictEqual(thread?.["config"], {
        mcp_servers: {
          figma: { default_tools_approval_mode: "prompt" },
          docs: {
            command: "docs-mcp",
            args: ["--stdio"],
            env: { A: "1" },
            default_tools_approval_mode: "prompt",
          },
          humanity: {
            url: "http://127.0.0.1:7420/mcp",
            http_headers: { Authorization: "Bearer thread-token" },
            tool_timeout_sec: 86_400,
            default_tools_approval_mode: "prompt",
            tools: {
              open_thread: { approval_mode: "approve" },
              load_skill: { approval_mode: "approve" },
              thread_history: { approval_mode: "approve" },
              terminal_list: { approval_mode: "approve" },
              terminal_read: { approval_mode: "approve" },
              terminal_send: { approval_mode: "approve" },
              terminal_wait: { approval_mode: "approve" },
              terminal_open: { approval_mode: "approve" },
              terminal_close: { approval_mode: "approve" },
            },
          },
        },
      })
      assert.strictEqual(turn?.params["approvalPolicy"], "untrusted")
      assert.strictEqual(turn?.params["approvalsReviewer"], "user")
      assert.strictEqual(turn?.params["model"], "gpt-test")
      assert.strictEqual(turn?.params["effort"], "high")
      assert.deepStrictEqual(turn?.params["input"], [
        { type: "text", text: "Fix the bug", text_elements: [] },
      ])

      const first = yield* run.messages.pipe(Stream.take(1), Stream.runCollect)
      assert.deepStrictEqual(first[0], {
        type: "codex",
        method: CODEX_READY,
        params: { threadId: "thread-1", model: "gpt-test" },
      })
    }).pipe(Effect.scoped),
  )

  it.live("resumes the thread it is given", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      yield* startCodexRun(codex.connect)(runOptions(allow, { resume: "thread-1" }))
      const resumed = yield* waitFor(codex)("thread/resume")
      assert.strictEqual(resumed?.params["threadId"], "thread-1")
      assert.strictEqual(resumed?.params["approvalPolicy"], "untrusted")
      assert.strictEqual(codex.called("thread/start").length, 0)
    }).pipe(Effect.scoped),
  )

  it.live("asks Humanity about a command and passes a denial on with its reason", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const asked: Array<ToolPermissionRequest> = []
      const run = yield* startCodexRun(codex.connect)(
        runOptions((request) => {
          asked.push(request)
          return String(request.input["command"]).startsWith("rm")
            ? { behavior: "deny", message: "DENIED by the human reviewer: keep the build." }
            : { behavior: "allow" }
        }),
      )
      yield* run.send({ text: "Clean up", attachments: [] })
      yield* waitFor(codex)("turn/start")

      const allowed = yield* codex.ask("item/commandExecution/requestApproval", {
        itemId: "cmd-1",
        command: "npm test",
        cwd: "/work/repo",
      })
      assert.deepStrictEqual(allowed.result, { decision: "accept" })
      assert.deepStrictEqual(asked[0], {
        toolName: "Bash",
        input: { command: "npm test", cwd: "/work/repo" },
        toolUseId: "cmd-1",
      })

      const denied = yield* codex.ask("item/commandExecution/requestApproval", {
        itemId: "cmd-2",
        command: "rm -rf build",
      })
      assert.deepStrictEqual(denied.result, { decision: "decline" })
      yield* denied.afterwards ?? Effect.void
      const steered = codex.called("turn/steer")[0]?.params
      assert.strictEqual(steered?.["expectedTurnId"], "turn-1")
      assert.deepStrictEqual(steered?.["input"], [
        {
          type: "text",
          text: "DENIED by the human reviewer: keep the build.",
          text_elements: [],
        },
      ])
    }).pipe(Effect.scoped),
  )

  it.live("asks about a file change with the files Codex announced for it", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const asked: Array<ToolPermissionRequest> = []
      const run = yield* startCodexRun(codex.connect)(
        runOptions((request) => {
          asked.push(request)
          return { behavior: "allow" }
        }),
      )
      yield* run.send({ text: "Add a file", attachments: [] })
      yield* waitFor(codex)("turn/start")
      yield* codex.notify("item/started", {
        item: {
          type: "fileChange",
          id: "patch-1",
          status: "inProgress",
          changes: [{ path: "/work/repo/a.txt", kind: { type: "add" }, diff: "hi\n" }],
        },
      })
      yield* run.messages.pipe(Stream.take(2), Stream.runDrain)

      const reply = yield* codex.ask("item/fileChange/requestApproval", { itemId: "patch-1" })
      assert.deepStrictEqual(reply.result, { decision: "accept" })
      assert.deepStrictEqual(asked[0], {
        toolName: "ApplyPatch",
        input: { changes: [{ path: "/work/repo/a.txt", kind: "add", diff: "hi\n" }] },
        toolUseId: "patch-1",
      })

      const unknown = yield* codex.ask("item/fileChange/requestApproval", { itemId: "patch-9" })
      assert.deepStrictEqual(unknown.result, { decision: "decline" })
      assert.strictEqual(asked.length, 1)
    }).pipe(Effect.scoped),
  )

  it.live("puts the agent's question to the human and returns the answers by question", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const run = yield* startCodexRun(codex.connect)(
        runOptions((request) => ({
          behavior: "allow",
          updatedInput: { ...request.input, answers: { "Which database?": "SQLite" } },
        })),
      )
      yield* run.send({ text: "Plan it", attachments: [] })
      yield* waitFor(codex)("turn/start")
      const reply = yield* codex.ask("item/tool/requestUserInput", {
        itemId: "q-1",
        questions: [
          {
            id: "db",
            header: "Database",
            question: "Which database?",
            options: [{ label: "SQLite", description: "A file" }],
          },
        ],
      })
      assert.deepStrictEqual(reply.result, { answers: { db: { answers: ["SQLite"] } } })
    }).pipe(Effect.scoped),
  )

  it.live("never grants wider permissions, and refuses requests it does not know", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const run = yield* startCodexRun(codex.connect)(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(codex)("turn/start")
      const reply = yield* codex.ask("item/permissions/requestApproval", { itemId: "x" })
      assert.deepStrictEqual(reply.result, { permissions: {}, scope: "turn" })
      const refused = yield* Effect.flip(codex.ask("attestation/generate", {}))
      assert.strictEqual(refused._tag, "CodexFailed")
    }).pipe(Effect.scoped),
  )

  it.live("runs one turn at a time and interrupts the one that is running", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const run = yield* startCodexRun(codex.connect)(runOptions(allow))
      yield* run.send({ text: "First", attachments: [] })
      yield* run.send({ text: "Second", attachments: [] })
      yield* waitFor(codex)("turn/start")
      yield* Effect.sleep("30 millis")
      assert.strictEqual(codex.called("turn/start").length, 1)

      yield* run.interrupt
      assert.deepStrictEqual(codex.called("turn/interrupt")[0]?.params, {
        threadId: "thread-1",
        turnId: "turn-1",
      })

      yield* codex.endTurn("turn-1", "interrupted")
      const second = yield* waitFor(codex)("turn/start", 2)
      assert.deepStrictEqual(second?.params["input"], [
        { type: "text", text: "Second", text_elements: [] },
      ])
    }).pipe(Effect.scoped),
  )

  it.live("leaves out what an agent Codex spawned says in a thread of its own", () =>
    Effect.gen(function* () {
      const codex = yield* fakeCodex
      const run = yield* startCodexRun(codex.connect)(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(codex)("turn/start")
      yield* codex.notify("item/agentMessage/delta", { threadId: "thread-2", delta: "other" })
      yield* codex.notify("item/agentMessage/delta", { delta: "mine" })
      const seen = yield* run.messages.pipe(Stream.take(2), Stream.runCollect)
      assert.deepStrictEqual((seen[1] as { params: unknown }).params, {
        threadId: "thread-1",
        delta: "mine",
      })
    }).pipe(Effect.scoped),
  )

  it.live("fails the run with Codex's reason when Codex cannot start", () =>
    Effect.gen(function* () {
      const connect: CodexConnect = () =>
        Effect.fail(new CodexFailed({ reason: "Codex could not be started: ENOENT" }))
      const run = yield* startCodexRun(connect)(runOptions(allow))
      const error = yield* Effect.flip(Stream.runDrain(run.messages))
      assert.strictEqual(error.message, "Codex could not be started: ENOENT")
    }).pipe(Effect.scoped),
  )
})
