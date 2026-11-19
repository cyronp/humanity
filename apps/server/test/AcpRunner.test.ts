import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { mkdirSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"
import { AcpFailed, type AgentMessage } from "../src/acp/Connection.ts"
import type { InitializeResponse } from "../src/acp/protocol.ts"
import {
  type AcpConnect,
  type AcpProfile,
  acpFileLinks,
  acpPrompt,
  startAcpRun,
} from "../src/agent/AcpRunner.ts"
import type {
  AgentRunOptions,
  PermissionDecision,
  ToolPermissionRequest,
} from "../src/agent/AgentRunner.ts"
import {
  ACP_READY,
  ACP_TEXT,
  ACP_TEXT_DELTA,
  ACP_THOUGHT,
  ACP_TOOL_COMPLETED,
  ACP_TOOL_STARTED,
  ACP_TURN_COMPLETED,
  type AcpEvent,
} from "../src/agent/normalizeAcp.ts"
import { tempDir } from "./helpers.ts"
import { eventually } from "./sessionHelpers.ts"

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

const SESSION = "session-1"

const fakeAgent = (agent: InitializeResponse = {}) =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const notified: Array<Call> = []
    const prompts: Array<Deferred.Deferred<unknown, AcpFailed>> = []
    const stopped = yield* Deferred.make<never, AcpFailed>()
    let onRequest: ((request: AgentMessage) => Effect.Effect<unknown, AcpFailed>) | undefined
    let onNotification: ((notification: AgentMessage) => Effect.Effect<void>) | undefined

    const answers: Record<string, () => unknown> = {
      "session/new": () => ({
        sessionId: SESSION,
        configOptions: [
          { id: "model", category: "model", type: "select", currentValue: "auto", options: [] },
          { id: "effortLevel", type: "select", currentValue: "medium", options: [] },
        ],
      }),
      "session/set_config_option": () => ({}),
    }

    const connect: AcpConnect = (options) =>
      Effect.sync(() => {
        onRequest = options.onRequest
        onNotification = options.onNotification
        return {
          agent,
          stopped: Deferred.await(stopped),
          notify: (method, params) =>
            Effect.sync(() => {
              notified.push({ method, params: (params ?? {}) as Record<string, unknown> })
            }),
          request: (method, params) =>
            Effect.gen(function* () {
              calls.push({ method, params: (params ?? {}) as Record<string, unknown> })
              if (method !== "session/prompt") return answers[method]?.() ?? {}
              const turn = yield* Deferred.make<unknown, AcpFailed>()
              prompts.push(turn)
              return yield* Deferred.await(turn)
            }),
        }
      })

    return {
      connect,
      answers,
      calls,
      notified,
      called: (method: string) => calls.filter((call) => call.method === method),
      update: (sessionUpdate: string, fields: Record<string, unknown> = {}, sessionId = SESSION) =>
        Effect.suspend(() => {
          if (onNotification === undefined) return Effect.die("the agent is not connected yet")
          return onNotification({
            method: "session/update",
            params: { sessionId, update: { sessionUpdate, ...fields } },
          })
        }),
      ask: (method: string, params: Record<string, unknown>) =>
        Effect.suspend(() => {
          if (onRequest === undefined) return Effect.die("the agent is not connected yet")
          return onRequest({ method, params: { sessionId: SESSION, ...params } })
        }),
      endTurn: (result: unknown = { stopReason: "end_turn" }) =>
        Effect.suspend(() => {
          const turn = prompts.shift()
          return turn === undefined
            ? Effect.die("no turn is running")
            : Deferred.succeed(turn, result)
        }),
      failTurn: (reason: string) =>
        Effect.suspend(() => {
          const turn = prompts.shift()
          return turn === undefined
            ? Effect.die("no turn is running")
            : Deferred.fail(turn, new AcpFailed({ reason }))
        }),
      stop: (reason: string) => Deferred.fail(stopped, new AcpFailed({ reason })),
    }
  })

const profile = (): AcpProfile => ({ product: "Test agent" })

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
  (agent: { readonly called: (method: string) => ReadonlyArray<Call> }) =>
  (method: string, count = 1) =>
    eventually(
      `${count} × ${method}`,
      Effect.sync(() => {
        const found = agent.called(method)
        return found.length >= count ? found[count - 1] : undefined
      }),
    )

const take = (run: { readonly messages: Stream.Stream<unknown, unknown> }, count: number) =>
  run.messages.pipe(
    Stream.take(count),
    Stream.runCollect,
    Effect.map((events) => Array.from(events) as Array<AcpEvent>),
  )

const ONCE = [
  { optionId: "yes", name: "Allow", kind: "allow_once" },
  { optionId: "always", name: "Always allow", kind: "allow_always" },
  { optionId: "no", name: "Reject", kind: "reject_once" },
]

describe("an ACP run", () => {
  it.live("opens a session with Humanity's MCP servers and prompts it", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent({
        agentCapabilities: { mcpCapabilities: { http: true }, promptCapabilities: { image: true } },
      })
      const run = yield* startAcpRun(
        agent.connect,
        profile,
      )(
        runOptions(allow, {
          model: "sonnet",
          effort: "high",
          extensions: {
            mcpServers: {
              docs: { type: "stdio", command: "docs-mcp", args: ["--stdio"], env: { A: "1" } },
              figma: { type: "http", url: "https://mcp.figma.com", headers: { K: "v" } },
              old: { type: "sse", url: "https://old.example", headers: {} },
            },
            plugins: [],
          },
        }),
      )
      yield* run.send({ text: "Fix the bug", attachments: [] })
      const prompt = yield* waitFor(agent)("session/prompt")

      assert.deepStrictEqual(agent.called("session/new")[0]?.params, {
        cwd: "/work/repo",
        mcpServers: [
          {
            name: "docs",
            command: "docs-mcp",
            args: ["--stdio"],
            env: [{ name: "A", value: "1" }],
          },
          {
            type: "http",
            name: "figma",
            url: "https://mcp.figma.com",
            headers: [{ name: "K", value: "v" }],
          },
        ],
      })
      assert.deepStrictEqual(
        agent.called("session/set_config_option").map((call) => call.params),
        [
          { sessionId: SESSION, configId: "model", value: "sonnet" },
          { sessionId: SESSION, configId: "effortLevel", value: "high" },
        ],
      )
      assert.deepStrictEqual(prompt?.params, {
        sessionId: SESSION,
        prompt: [{ type: "text", text: "Fix the bug" }],
      })

      const [ready] = yield* take(run, 1)
      assert.strictEqual(ready?.method, ACP_READY)
      assert.deepStrictEqual(ready?.params, { sessionId: SESSION, model: "sonnet" })
    }),
  )

  it.live("puts a streamed answer back together around the tool calls", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(agent.connect, profile)(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      const chunk = (text: string) => ({ content: { type: "text", text } })
      yield* agent.update("agent_thought_chunk", chunk("Let me "))
      yield* agent.update("agent_thought_chunk", chunk("look."))
      yield* agent.update("agent_message_chunk", chunk("I will "))
      yield* agent.update("agent_message_chunk", chunk("list the files."))
      yield* agent.update("tool_call", { toolCallId: "t1", title: "Running", status: "pending" })
      yield* agent.update("tool_call_update", {
        toolCallId: "t1",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "ls" },
      })
      yield* agent.update("tool_call_update", {
        toolCallId: "t1",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "a.ts\nb.ts" } }],
      })
      yield* agent.update("agent_message_chunk", chunk("Elsewhere."), "session-2")
      yield* agent.update("agent_message_chunk", chunk("Two files."))
      yield* agent.update("usage_update", { used: 1200, size: 200000 })
      yield* agent.endTurn({
        stopReason: "end_turn",
        usage: { totalTokens: 30, inputTokens: 20, outputTokens: 10, cachedReadTokens: 5 },
      })

      const events = yield* take(run, 10)
      assert.deepStrictEqual(
        events.map((event) => event.method),
        [
          ACP_READY,
          ACP_THOUGHT,
          ACP_TEXT_DELTA,
          ACP_TEXT_DELTA,
          ACP_TEXT,
          ACP_TOOL_STARTED,
          ACP_TOOL_COMPLETED,
          ACP_TEXT_DELTA,
          ACP_TEXT,
          ACP_TURN_COMPLETED,
        ],
      )
      assert.deepStrictEqual(events[1]?.params, { text: "Let me look." })
      assert.deepStrictEqual(events[4]?.params, { text: "I will list the files." })
      const started = events[5]?.params as Record<string, unknown>
      assert.strictEqual(started["toolCallId"], "t1")
      assert.strictEqual(started["toolName"], "Bash")
      assert.deepStrictEqual(started["input"], { command: "ls", description: "Running" })
      const completed = events[6]?.params as Record<string, unknown>
      assert.strictEqual(completed["content"], "a.ts\nb.ts")
      assert.strictEqual(completed["isError"], false)
      assert.deepStrictEqual(events[8]?.params, { text: "Two files." })
      const turn = events[9]?.params as Record<string, unknown>
      assert.strictEqual(turn["stopReason"], "end_turn")
      assert.strictEqual(turn["error"], null)
      assert.deepStrictEqual(turn["usage"], {
        inputTokens: 20,
        outputTokens: 10,
        cachedReadTokens: 5,
        cachedWriteTokens: 0,
      })
      assert.deepStrictEqual(yield* run.contextUsage, { usedTokens: 1200, maxTokens: 200000 })
    }),
  )

  it.live("asks Humanity before a tool runs and allows it only once", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const asked: Array<ToolPermissionRequest> = []
      const run = yield* startAcpRun(
        agent.connect,
        profile,
      )(
        runOptions((request) => {
          asked.push(request)
          return { behavior: "allow" }
        }),
      )
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      const answer = yield* agent.ask("session/request_permission", {
        toolCall: {
          toolCallId: "t1",
          title: "Edit src/app.ts",
          kind: "edit",
          status: "pending",
          content: [
            { type: "diff", path: "/work/repo/src/app.ts", oldText: "a\nb\n", newText: "a\nc\n" },
          ],
        },
        options: ONCE,
      })
      assert.deepStrictEqual(answer, { outcome: { outcome: "selected", optionId: "yes" } })
      assert.strictEqual(asked[0]?.toolName, "ApplyPatch")
      assert.strictEqual(asked[0]?.toolUseId, "t1")
      assert.deepStrictEqual(asked[0]?.input, {
        changes: [
          { path: "/work/repo/src/app.ts", kind: "update", diff: "@@ -1,2 +1,2 @@\n a\n-b\n+c" },
        ],
      })

      const events = yield* take(run, 2)
      assert.strictEqual(events[1]?.method, ACP_TOOL_STARTED)

      const onlyAlways = yield* agent.ask("session/request_permission", {
        toolCall: { toolCallId: "t2", title: "npm test", kind: "execute" },
        options: [{ optionId: "always", name: "Always allow", kind: "allow_always" }],
      })
      assert.deepStrictEqual(onlyAlways, { outcome: { outcome: "cancelled" } })
    }),
  )

  it.live("declines a call and tells the agent why with the next message", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(
        agent.connect,
        profile,
      )(runOptions(() => ({ behavior: "deny", message: "Keep the old validation." })))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      const answer = yield* agent.ask("session/request_permission", {
        toolCall: { toolCallId: "t1", title: "rm -rf build", kind: "execute" },
        options: ONCE,
      })
      assert.deepStrictEqual(answer, { outcome: { outcome: "selected", optionId: "no" } })
      yield* agent.endTurn()

      yield* run.send({ text: "Try again", attachments: [] })
      const second = yield* waitFor(agent)("session/prompt", 2)
      assert.deepStrictEqual(second?.params["prompt"], [
        {
          type: "text",
          text: "[About calls that were declined in your last turn]\nKeep the old validation.\n\nTry again",
        },
      ])
    }),
  )

  it.live("steers a running turn where the agent can be steered", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const steered: Array<string> = []
      const run = yield* startAcpRun(agent.connect, () => ({
        product: "Test agent",
        steer: (_connection, sessionId, message) =>
          Effect.sync(() => void steered.push(`${sessionId}: ${message}`)),
        toolCall: (call) =>
          Effect.succeed(
            call.title === "figma" ? { toolName: "mcp__figma__get", input: {} } : undefined,
          ),
      }))(
        runOptions((request) => ({
          behavior: "deny",
          message: `No ${request.toolName}.`,
        })),
      )
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")
      yield* agent.ask("session/request_permission", {
        toolCall: { toolCallId: "t1", title: "figma", kind: "other" },
        options: ONCE,
      })
      assert.deepStrictEqual(steered, [`${SESSION}: No mcp__figma__get.`])
    }),
  )

  it.live("takes a turn's pending questions with it when the turn is interrupted", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const reached = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const run = yield* startAcpRun(
        agent.connect,
        profile,
      )(
        runOptions(allow, {
          canUseTool: () =>
            Deferred.succeed(reached, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(released, undefined)),
            ),
        }),
      )
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      const pending = yield* Effect.forkChild(
        agent.ask("session/request_permission", {
          toolCall: { toolCallId: "t1", title: "npm test", kind: "execute" },
          options: ONCE,
        }),
      )
      yield* Deferred.await(reached)
      yield* run.interrupt

      assert.deepStrictEqual(yield* Fiber.join(pending), { outcome: { outcome: "cancelled" } })
      yield* Deferred.await(released)
      assert.deepStrictEqual(agent.notified, [
        { method: "session/cancel", params: { sessionId: SESSION } },
      ])

      yield* agent.endTurn({ stopReason: "cancelled" })
      const events = yield* take(run, 3)
      const turn = events[2]?.params as Record<string, unknown>
      assert.strictEqual(turn["stopReason"], "cancelled")
    }),
  )

  it.live("reopens a session without showing its history again", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent({ agentCapabilities: { loadSession: true } })
      const run = yield* startAcpRun(
        agent.connect,
        profile,
      )(runOptions(allow, { resume: "session-old" }))
      yield* run.send({ text: "Continue", attachments: [] })
      const prompt = yield* waitFor(agent)("session/prompt")

      assert.deepStrictEqual(agent.called("session/load")[0]?.params, {
        sessionId: "session-old",
        cwd: "/work/repo",
        mcpServers: [],
      })
      assert.strictEqual(agent.called("session/new").length, 0)
      assert.strictEqual(prompt?.params["sessionId"], "session-old")
      const [ready] = yield* take(run, 1)
      assert.deepStrictEqual(ready?.params, { sessionId: "session-old", model: "" })
    }),
  )

  it.live("says so when the agent cannot reopen a session", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(
        agent.connect,
        profile,
      )(runOptions(allow, { resume: "session-old" }))
      const failure = yield* Effect.flip(Stream.runDrain(run.messages))
      assert.include(failure.message, "cannot reopen")
    }),
  )

  it.live("reports a turn that failed and a process that stopped", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(agent.connect, profile)(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")
      yield* agent.failTurn("The model is not available.")

      const events = yield* take(run, 2)
      const turn = events[1]?.params as Record<string, unknown>
      assert.strictEqual(turn["error"], "The model is not available.")

      yield* agent.stop("Test agent stopped unexpectedly.")
      const failure = yield* Effect.flip(Stream.runDrain(run.messages))
      assert.strictEqual(failure.message, "Test agent stopped unexpectedly.")
    }),
  )

  it.live("writes the model to an agent that lists it late, then the effort it lists with it", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      agent.answers["session/new"] = () => ({ sessionId: SESSION, configOptions: [] })
      const run = yield* startAcpRun(agent.connect, () => ({
        product: "Test agent",
        lateModelOption: "model",
      }))(runOptions(allow, { model: "opus", effort: "high" }))
      yield* run.send({ text: "Go", attachments: [] })

      yield* waitFor(agent)("session/set_config_option")
      yield* agent.update("config_option_update", {
        configOptions: [
          { id: "model", category: "model", type: "select", currentValue: "opus" },
          {
            id: "effortLevel",
            category: "thought_level",
            type: "select",
            currentValue: "medium",
            options: [{ value: "medium" }, { value: "high" }],
          },
        ],
      })
      yield* waitFor(agent)("session/prompt")
      assert.deepStrictEqual(
        agent.called("session/set_config_option").map((call) => call.params),
        [
          { sessionId: SESSION, configId: "model", value: "opus" },
          { sessionId: SESSION, configId: "effortLevel", value: "high" },
        ],
      )
    }),
  )

  it.live("leaves the effort alone when the model offers no such level", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      agent.answers["session/new"] = () => ({
        sessionId: SESSION,
        configOptions: [
          {
            id: "effortLevel",
            category: "thought_level",
            type: "select",
            currentValue: "low",
            options: [{ value: "low" }, { value: "high" }],
          },
        ],
      })
      const run = yield* startAcpRun(agent.connect, profile)(runOptions(allow, { effort: "max" }))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")
      assert.strictEqual(agent.called("session/set_config_option").length, 0)
    }),
  )

  const SUPERVISED: AcpProfile = {
    product: "Test agent",
    settings: [{ id: "autopilot", value: "off" }],
  }
  const autopilot = (currentValue: string) => ({
    sessionId: SESSION,
    configOptions: [{ id: "autopilot", type: "select", currentValue }],
  })

  it.live("sets the session to ask before it says the thread is ready", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      agent.answers["session/new"] = () => autopilot("on")
      agent.answers["session/set_config_option"] = () => autopilot("off")
      const run = yield* startAcpRun(agent.connect, () => SUPERVISED)(runOptions(allow))
      const [ready] = yield* take(run, 1)
      assert.strictEqual(ready?.method, ACP_READY)
      assert.deepStrictEqual(
        agent.called("session/set_config_option").map((call) => call.params),
        [{ sessionId: SESSION, configId: "autopilot", value: "off" }],
      )
    }),
  )

  it.live("does not run an agent that will not be set to ask", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      agent.answers["session/new"] = () => autopilot("on")
      agent.answers["session/set_config_option"] = () => autopilot("on")
      const run = yield* startAcpRun(agent.connect, () => SUPERVISED)(runOptions(allow))
      const failure = yield* Effect.flip(Stream.runDrain(run.messages))
      assert.include(failure.message, "ask before it acts")
      assert.strictEqual(agent.called("session/prompt").length, 0)
    }),
  )

  const reviewOf = (...ids: ReadonlyArray<string>) => ({
    toolCall: { toolCallId: "review-1", title: "Review changes", status: "pending" },
    options: [
      { optionId: "accept", name: "Accept changes", kind: "allow_once" },
      { optionId: "reject", name: "Reject changes", kind: "reject_once" },
    ],
    covers: ids,
  })
  const reviewing = (): AcpProfile => ({
    product: "Test agent",
    review: (request) => (request as { readonly covers?: ReadonlyArray<string> }).covers,
  })

  it.live("accepts a review of changes it allowed one by one, without asking again", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const asked: Array<string> = []
      const run = yield* startAcpRun(
        agent.connect,
        reviewing,
      )(
        runOptions((request) => {
          asked.push(request.toolName)
          return { behavior: "allow" }
        }),
      )
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")
      yield* agent.ask("session/request_permission", {
        toolCall: { toolCallId: "t1", title: "npm test", kind: "execute" },
        options: ONCE,
      })

      const answer = yield* agent.ask("session/request_permission", reviewOf("t1"))
      assert.deepStrictEqual(answer, { outcome: { outcome: "selected", optionId: "accept" } })
      assert.deepStrictEqual(asked, ["Bash"])
    }),
  )

  it.live("asks about a review that covers a change it was never asked about", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const asked: Array<string> = []
      const run = yield* startAcpRun(
        agent.connect,
        reviewing,
      )(
        runOptions((request) => {
          asked.push(request.toolName)
          return { behavior: "deny", message: "Not that file." }
        }),
      )
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      const answer = yield* agent.ask("session/request_permission", reviewOf("t9"))
      assert.deepStrictEqual(answer, { outcome: { outcome: "selected", optionId: "reject" } })
      assert.deepStrictEqual(asked, ["Review changes"])
      const events = yield* take(run, 3)
      assert.deepStrictEqual(
        events.map((event) => event.method),
        [ACP_READY, ACP_TOOL_STARTED, ACP_TOOL_COMPLETED],
      )
      assert.strictEqual((events[2]?.params as Record<string, unknown>)["content"], "Rejected.")
    }),
  )

  it.live("shows a sub-agent's calls under the call that started it, and not what it says", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(agent.connect, () => ({
        product: "Test agent",
        subtask: (update) =>
          typeof update["sub"] === "string"
            ? { id: update["sub"], owner: update["owner"] === true }
            : undefined,
      }))(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      yield* agent.update("tool_call", {
        toolCallId: "task",
        title: "Sub-agent: explore",
        kind: "other",
        status: "in_progress",
        sub: "s1",
        owner: true,
      })
      yield* agent.update("agent_message_chunk", {
        content: { type: "text", text: "I am the sub-agent." },
        sub: "s1",
      })
      yield* agent.update("tool_call", {
        toolCallId: "inner",
        title: "ls",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "ls" },
        sub: "s1",
      })
      yield* agent.update("tool_call_update", {
        toolCallId: "inner",
        status: "completed",
        sub: "s1",
      })
      yield* agent.update("tool_call_update", {
        toolCallId: "task",
        status: "completed",
        rawOutput: "Done",
        sub: "s1",
        owner: true,
      })
      yield* agent.endTurn()

      const events = yield* take(run, 6)
      assert.deepStrictEqual(
        events.map((event) => [
          event.method,
          (event.params as Record<string, unknown>)["toolCallId"],
          (event.params as Record<string, unknown>)["parent"],
        ]),
        [
          [ACP_READY, undefined, undefined],
          [ACP_TOOL_STARTED, "task", null],
          [ACP_TOOL_STARTED, "inner", "task"],
          [ACP_TOOL_COMPLETED, "inner", "task"],
          [ACP_TOOL_COMPLETED, "task", null],
          [ACP_TURN_COMPLETED, undefined, undefined],
        ],
      )
    }),
  )

  it.live("holds a cancel until the agent shows its turn has begun", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(agent.connect, () => ({
        product: "Test agent",
        cancelHold: {
          started: (update) => update.sessionUpdate === "agent_message_chunk",
          atMost: "30 seconds",
        },
      }))(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")

      yield* run.interrupt
      yield* Effect.sleep("50 millis")
      assert.deepStrictEqual(agent.notified, [])

      yield* agent.update("agent_message_chunk", { content: { type: "text", text: "On it." } })
      yield* eventually(
        "the cancel",
        Effect.sync(() => agent.notified[0]),
      )
      assert.deepStrictEqual(agent.notified, [
        { method: "session/cancel", params: { sessionId: SESSION } },
      ])
    }),
  )

  it.live("leaves out what the agent's profile says is not the conversation", () =>
    Effect.gen(function* () {
      const agent = yield* fakeAgent()
      const run = yield* startAcpRun(agent.connect, () => ({
        product: "Test agent",
        update: (update) => (update["title"] === "Housekeeping" ? undefined : update),
      }))(runOptions(allow))
      yield* run.send({ text: "Go", attachments: [] })
      yield* waitFor(agent)("session/prompt")
      yield* agent.update("tool_call", {
        toolCallId: "h1",
        title: "Housekeeping",
        kind: "other",
        status: "in_progress",
      })
      yield* agent.endTurn()
      const events = yield* take(run, 2)
      assert.deepStrictEqual(
        events.map((event) => event.method),
        [ACP_READY, ACP_TURN_COMPLETED],
      )
    }),
  )
})

describe("acpPrompt", () => {
  const message = {
    text: "Look",
    attachments: [
      { kind: "image", name: "a.png", mediaType: "image/png", base64: "AAAA" },
      { kind: "text", name: "notes.md", text: "hello" },
      { kind: "pdf", name: "spec.pdf", base64: "BBBB" },
    ],
  } as const

  it("sends images to an agent that reads them, and files inline", () => {
    assert.deepStrictEqual(acpPrompt(message, { images: true }), [
      { type: "image", data: "AAAA", mimeType: "image/png" },
      {
        type: "text",
        text: 'Look\n\n<file name="notes.md">\nhello\n</file>\n\n[The PDF spec.pdf was attached, but this agent cannot read PDF files.]',
      },
    ])
  })

  it("says an image was left out for an agent that cannot read one", () => {
    const [only] = acpPrompt(
      { ...message, attachments: [message.attachments[0]] },
      { images: false },
    )
    assert.deepStrictEqual(only, {
      type: "text",
      text: "Look\n\n[The image a.png was attached, but this agent cannot read images.]",
    })
  })

  it("links mentioned files after the text", () => {
    const links = [{ uri: "file:///repo/src/a.ts", name: "src/a.ts" }]
    assert.deepStrictEqual(
      acpPrompt({ text: "Look at @src/a.ts", attachments: [] }, { images: true, links }),
      [
        { type: "text", text: "Look at @src/a.ts" },
        { type: "resource_link", uri: "file:///repo/src/a.ts", name: "src/a.ts" },
      ],
    )
  })
})

describe("acpFileLinks", () => {
  it.effect("links existing files inside the folder, once each, and nothing else", () =>
    Effect.gen(function* () {
      const outside = yield* tempDir()
      const root = yield* tempDir()
      mkdirSync(join(root, "src"))
      writeFileSync(join(root, "src", "a.ts"), "a")
      writeFileSync(join(outside, "secret.txt"), "s")
      const links = yield* acpFileLinks(root, [
        "src/a.ts",
        "./src/a.ts",
        "src/",
        "src",
        "missing.ts",
        `../${basename(outside)}/secret.txt`,
        join(outside, "secret.txt"),
      ])
      assert.deepStrictEqual(links, [
        { uri: pathToFileURL(join(root, "src", "a.ts")).href, name: "src/a.ts" },
      ])
    }),
  )

  it.effect("links nothing when the folder is gone", () =>
    Effect.gen(function* () {
      const root = yield* tempDir()
      assert.deepStrictEqual(yield* acpFileLinks(join(root, "gone"), ["a.ts"]), [])
    }),
  )
})
