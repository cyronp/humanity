import { assert, describe, it } from "@effect/vitest"
import { HUMANITY_TOOL_TOKENS, ProjectId, SessionId } from "@humanity/contracts"
import { Effect, Exit, Layer, Scope } from "effect"
import {
  answerMcp,
  HumanityMcp,
  OPEN_THREAD_TOOL_DEFINITION,
  type HumanityTools,
  OpenThreadFailed,
  type OpenThreadRequest,
} from "../src/mcp/HumanityMcp.ts"
import { ServerConfig } from "../src/ServerConfig.ts"
import { systemPromptAppend } from "../src/agent/AgentRunnerLive.ts"
import { HUMANITY_INSTRUCTIONS, TERMINAL_TOOL_DEFINITIONS } from "../src/terminal/agentTools.ts"

const recordingTools = () => {
  const asked: Array<OpenThreadRequest> = []
  const terminalCalls: Array<{ readonly tool: string; readonly args: unknown }> = []
  const tools: HumanityTools = {
    terminal: (tool, args) =>
      Effect.sync(() => {
        terminalCalls.push({ tool, args })
        return { text: `${tool} done`, isError: tool === "terminal_close" }
      }),
    openThread: (request) =>
      request.prompt === "fail"
        ? Effect.fail(new OpenThreadFailed({ reason: "No thread was opened: it failed." }))
        : Effect.sync(() => {
            asked.push(request)
            return {
              sessionId: SessionId.make("s2"),
              projectId: ProjectId.make("p1"),
              title: request.title ?? "Untitled",
              provider: request.provider ?? "claude-code",
              model: request.model ?? null,
              effort: request.effort ?? null,
            }
          }),
  }
  return { tools, asked, terminalCalls }
}

const call = (id: number, method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
})

const openThread = (args: unknown) =>
  call(3, "tools/call", { name: "open_thread", arguments: args })

describe("Humanity's MCP server", () => {
  it.effect("introduces itself in the client's protocol version, or its own newest", () =>
    Effect.gen(function* () {
      const { tools } = recordingTools()
      const known = yield* answerMcp(
        tools,
        call(0, "initialize", { protocolVersion: "2025-06-18", capabilities: {} }),
      )
      assert.strictEqual(known.status, 200)
      assert.deepInclude(known.body as object, {
        jsonrpc: "2.0",
        id: 0,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "humanity", title: "Humanity", version: "0.1.0" },
          instructions: HUMANITY_INSTRUCTIONS,
        },
      })
      const newer = yield* answerMcp(
        tools,
        call(1, "initialize", { protocolVersion: "2099-01-01" }),
      )
      assert.strictEqual(
        (newer.body as { result: { protocolVersion: string } }).result.protocolVersion,
        "2025-11-25",
      )
    }),
  )

  it.effect("accepts notifications with nothing to say, and refuses what it does not know", () =>
    Effect.gen(function* () {
      const { tools } = recordingTools()
      assert.deepStrictEqual(
        yield* answerMcp(tools, { jsonrpc: "2.0", method: "notifications/initialized" }),
        { status: 202 },
      )
      const unknown = yield* answerMcp(tools, call(4, "server/discover"))
      assert.deepStrictEqual(unknown.body, {
        jsonrpc: "2.0",
        id: 4,
        error: { code: -32601, message: "Method not found: server/discover" },
      })
      const noTool = yield* answerMcp(tools, call(5, "tools/call", { name: "rm_rf" }))
      assert.strictEqual((noTool.body as { error: { code: number } }).error.code, -32602)
      const notRpc = yield* answerMcp(tools, { hello: "there" })
      assert.strictEqual((notRpc.body as { error: { code: number } }).error.code, -32600)
      assert.deepStrictEqual((yield* answerMcp(tools, call(6, "ping"))).body, {
        jsonrpc: "2.0",
        id: 6,
        result: {},
      })
    }),
  )

  it.effect("lists open_thread with every provider and effort it takes", () =>
    Effect.gen(function* () {
      const { tools } = recordingTools()
      const listed = yield* answerMcp(tools, call(2, "tools/list"))
      const [tool] = (
        listed.body as {
          result: {
            tools: ReadonlyArray<{
              name: string
              _meta: Record<string, unknown>
              inputSchema: {
                properties: Record<string, { enum?: ReadonlyArray<string> }>
                required: ReadonlyArray<string>
              }
            }>
          }
        }
      ).result.tools
      assert.strictEqual(tool?.name, "open_thread")
      assert.isTrue(tool?._meta["anthropic/alwaysLoad"])
      assert.deepStrictEqual(tool?.inputSchema.required, ["prompt"])
      assert.deepStrictEqual(tool?.inputSchema.properties["provider"]?.enum, [
        "claude-code",
        "codex",
        "kiro",
        "antigravity",
      ])
      assert.deepStrictEqual(tool?.inputSchema.properties["effort"]?.enum, [
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ])
    }),
  )

  it.effect("lists, describes and answers only the tools it was given", () =>
    Effect.gen(function* () {
      const { tools } = recordingTools()
      const names = (reply: { readonly body?: unknown }) =>
        (reply.body as { result: { tools: ReadonlyArray<{ name: string }> } }).result.tools.map(
          (tool) => tool.name,
        )
      const instructions = (reply: { readonly body?: unknown }) =>
        (reply.body as { result: { instructions?: string } }).result.instructions

      const terminalsOnly: HumanityTools = { terminal: tools.terminal! }
      const listed = names(yield* answerMcp(terminalsOnly, call(1, "tools/list")))
      assert.notInclude(listed, "open_thread")
      assert.include(listed, "terminal_list")
      assert.strictEqual(
        instructions(yield* answerMcp(terminalsOnly, call(2, "initialize"))),
        HUMANITY_INSTRUCTIONS,
      )
      const refused = yield* answerMcp(terminalsOnly, openThread({ prompt: "hi" }))
      assert.strictEqual((refused.body as { error: { code: number } }).error.code, -32602)

      const openThreadOnly: HumanityTools = { openThread: tools.openThread! }
      assert.deepStrictEqual(names(yield* answerMcp(openThreadOnly, call(4, "tools/list"))), [
        "open_thread",
      ])
      assert.isUndefined(instructions(yield* answerMcp(openThreadOnly, call(5, "initialize"))))
      const noTerminal = yield* answerMcp(
        openThreadOnly,
        call(6, "tools/call", { name: "terminal_list", arguments: {} }),
      )
      assert.strictEqual((noTerminal.body as { error: { code: number } }).error.code, -32602)
    }),
  )

  it("costs about as many tokens as Settings says", () => {
    const sent = (tool: {
      readonly name: string
      readonly description: string
      readonly inputSchema: unknown
    }) =>
      JSON.stringify({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })
    const estimate = (text: string) => text.length / 3.6
    const terminals = TERMINAL_TOOL_DEFINITIONS.map(sent).join("") + HUMANITY_INSTRUCTIONS
    const openThread =
      sent(OPEN_THREAD_TOOL_DEFINITION) +
      systemPromptAppend(true).slice(systemPromptAppend(false).length)
    for (const [tool, text] of [
      ["terminals", terminals],
      ["openThread", openThread],
    ] as const) {
      const ratio = estimate(text) / HUMANITY_TOOL_TOKENS[tool]
      assert.isTrue(
        ratio > 0.8 && ratio < 1.2,
        `${tool}: about ${Math.round(estimate(text))} tokens now, Settings says ${HUMANITY_TOOL_TOKENS[tool]}`,
      )
    }
  })

  it.effect("opens a thread on the provider, model and effort asked for", () =>
    Effect.gen(function* () {
      const { tools, asked } = recordingTools()
      const opened = yield* answerMcp(
        tools,
        openThread({
          prompt: "Fix the flaky test",
          title: "Flaky",
          provider: "kiro",
          model: "claude-sonnet-5.5",
          effort: "high",
        }),
      )
      assert.deepStrictEqual(asked, [
        {
          prompt: "Fix the flaky test",
          title: "Flaky",
          provider: "kiro",
          model: "claude-sonnet-5.5",
          effort: "high",
        },
      ])
      const result = (opened.body as { result: { content: [{ text: string }]; isError?: true } })
        .result
      assert.isUndefined(result.isError)
      assert.include(result.content[0].text, 'Opened the thread "Flaky" on Kiro, claude-sonnet-5.5')
      assert.include(result.content[0].text, "[Flaky](/projects/p1/sessions/s2)")

      yield* answerMcp(tools, openThread({ prompt: "Again", provider: null, effort: null }))
      assert.deepStrictEqual(asked[1], { prompt: "Again", provider: null, effort: null })
    }),
  )

  it.effect("tells the agent why no thread was opened, as a tool error it can act on", () =>
    Effect.gen(function* () {
      const { tools, asked } = recordingTools()
      const errorText = (reply: { readonly body?: unknown }) => {
        const result = (reply.body as { result: { content: [{ text: string }]; isError?: true } })
          .result
        assert.isTrue(result.isError)
        return result.content[0].text
      }
      assert.match(
        errorText(yield* answerMcp(tools, openThread({ prompt: "x", provider: "gemini" }))),
        /provider` \(claude-code, codex, kiro, antigravity\)/,
      )
      assert.match(errorText(yield* answerMcp(tools, openThread({}))), /Pass `prompt`/)
      assert.strictEqual(
        errorText(yield* answerMcp(tools, openThread({ prompt: "fail" }))),
        "No thread was opened: it failed.",
      )
      assert.lengthOf(asked, 0)
    }),
  )

  it.effect("answers a batch message by message, leaving out its notifications", () =>
    Effect.gen(function* () {
      const { tools } = recordingTools()
      const reply = yield* answerMcp(tools, [
        { jsonrpc: "2.0", method: "notifications/initialized" },
        call(7, "ping"),
      ])
      assert.deepStrictEqual(reply, {
        status: 200,
        body: [{ jsonrpc: "2.0", id: 7, result: {} }],
      })
      assert.strictEqual((yield* answerMcp(tools, [])).status, 400)
    }),
  )

  it.effect("gives each thread its own token, good only while its agent runs", () =>
    Effect.gen(function* () {
      const mcp = yield* HumanityMcp
      const first = recordingTools()
      const scope = yield* Scope.make()
      const server = yield* mcp.serve(first.tools).pipe(Scope.provide(scope))
      const other = yield* mcp.serve(recordingTools().tools).pipe(Scope.provide(scope))
      if (server.type !== "http" || other.type !== "http") return assert.fail("expected HTTP")

      assert.strictEqual(server.url, "http://127.0.0.1:7999/mcp")
      const authorization = server.headers["Authorization"]
      assert.notStrictEqual(authorization, other.headers["Authorization"])
      assert.strictEqual(mcp.toolsFor(authorization), first.tools)
      assert.isUndefined(mcp.toolsFor(undefined))
      assert.isUndefined(mcp.toolsFor(authorization?.replace("Bearer ", "")))
      assert.isUndefined(mcp.toolsFor("Bearer not-a-thread"))

      yield* Scope.close(scope, Exit.void)
      assert.isUndefined(mcp.toolsFor(authorization))
    }).pipe(
      Effect.provide(
        HumanityMcp.layer.pipe(
          Layer.provide(
            Layer.succeed(ServerConfig, {
              host: "127.0.0.1",
              port: 7999,
            } as ServerConfig["Service"]),
          ),
        ),
      ),
    ),
  )
})
