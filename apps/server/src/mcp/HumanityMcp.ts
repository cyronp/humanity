import {
  AgentProvider,
  formatOpenedThread,
  HUMANITY_MCP_SERVER,
  OPEN_THREAD_TOOL_NAME,
  type OpenedThread,
  PROVIDER_NAMES,
  ReasoningEffort,
} from "@humanity/contracts"
import { Context, Data, Effect, Layer, Option, Schema, type Scope } from "effect"
import { randomBytes } from "node:crypto"
import type { AgentMcpServer } from "../agent/AgentRunner.ts"
import { ServerConfig } from "../ServerConfig.ts"

/**
 * Humanity's own MCP server: the tools the app itself gives the agent of a
 * thread. The daemon serves it over MCP's Streamable HTTP transport, so every
 * provider reaches it the way it reaches any MCP server the human added,
 * whatever process the agent runs in. Each thread gets a token of its own,
 * which says which thread a call comes from and lives only as long as the
 * thread's agent does. It is kept in memory, never in the database.
 *
 * Only what the agents need of the transport is spoken: each POST carries one
 * JSON-RPC message (or a batch) and is answered with plain JSON, never a
 * stream, and there is no session to resume. https://modelcontextprotocol.io
 */
export const MCP_PATH = "/mcp"

/** The protocol versions this server speaks, newest first. */
const PROTOCOL_VERSIONS: ReadonlyArray<string> = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]

/** What the agent passes to `open_thread`. */
export const OpenThreadRequest = Schema.Struct({
  prompt: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  provider: Schema.optional(Schema.NullOr(AgentProvider)),
  model: Schema.optional(Schema.NullOr(Schema.String)),
  effort: Schema.optional(Schema.NullOr(ReasoningEffort)),
})
export type OpenThreadRequest = typeof OpenThreadRequest.Type
const decodeOpenThread = Schema.decodeUnknownOption(OpenThreadRequest)

/** Why a thread was not opened, in words the agent can act on. */
export class OpenThreadFailed extends Data.TaggedError("OpenThreadFailed")<{
  readonly reason: string
}> {}

/** What Humanity's tools do for one thread. */
export interface HumanityTools {
  /** Starts a new thread in the thread's project on the given prompt. */
  readonly openThread: (request: OpenThreadRequest) => Effect.Effect<OpenedThread, OpenThreadFailed>
}

const providers = AgentProvider.literals
  .map((provider) => `\`${provider}\` (${PROVIDER_NAMES[provider]})`)
  .join(", ")

const OPEN_THREAD_DESCRIPTION = `Opens a new thread in Humanity, in the same project as this one, and starts it on the given prompt. Use it only when the human asks you to open, start or hand work to another thread, optionally on a specific provider, model or reasoning effort; never on your own initiative.
The new thread is a separate conversation with its own agent: it sees nothing of this one, so the prompt must stand on its own (the problem, the files involved, what done looks like). It starts in the project's checkout, which this thread may also be working in. You are not told when it finishes or what it did.
The result gives you a markdown link to the new thread. Use it inline in your reply, where you mention the thread: the human sees it as the project's icon and the thread's title, and clicks it to go there.`

const OPEN_THREAD_TOOL_DEFINITION = {
  name: OPEN_THREAD_TOOL_NAME,
  title: "Open a thread",
  description: OPEN_THREAD_DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The new thread's first message: the whole task, self-contained.",
      },
      title: {
        type: "string",
        description: "A short title for the thread. Defaults to the prompt's first line.",
      },
      provider: {
        type: "string",
        enum: [...AgentProvider.literals],
        description: `The agent the thread runs on: ${providers}. Leave out for the one this thread runs on.`,
      },
      model: {
        type: "string",
        description:
          "The model to run on, one the provider offers this account. For Claude Code, prefer its aliases: `opus`, `sonnet`, `haiku`, `fable`. A name with its version (`Haiku 5.5`, `claude-haiku-5-5`) is matched to what the account offers; a model it does not offer is refused with the list of those it does. Leave out for the provider's default.",
      },
      effort: {
        type: "string",
        enum: [...ReasoningEffort.literals],
        description: "How hard the model reasons. Leave out for the model's default.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  // Claude Code would otherwise defer it behind its ToolSearch tool, which a thread that asks asks about.
  _meta: { "anthropic/alwaysLoad": true },
}

/** How the daemon answers one POST: a status and, unless there is nothing to say, a JSON body. */
export interface McpReply {
  readonly status: number
  readonly body?: unknown
}

type JsonRpcId = string | number | null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const result = (id: JsonRpcId, value: unknown) => ({ jsonrpc: "2.0", id, result: value })
const error = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
})
const toolText = (text: string, isError = false) => ({
  content: [{ type: "text", text }],
  ...(isError ? { isError: true } : {}),
})

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

/** Calls one of Humanity's tools for the thread whose tools these are. */
const callTool = (tools: HumanityTools, params: Record<string, unknown>) => {
  const name = params["name"]
  if (name !== OPEN_THREAD_TOOL_NAME) return Option.none()
  const request = decodeOpenThread(params["arguments"] ?? {})
  if (Option.isNone(request)) {
    return Option.some(
      Effect.succeed(
        toolText(
          `No thread was opened: the arguments do not match the tool's input schema. Pass \`prompt\` as a string, and \`provider\` (${AgentProvider.literals.join(", ")}) and \`effort\` (${ReasoningEffort.literals.join(", ")}) only with one of their values.`,
          true,
        ),
      ),
    )
  }
  return Option.some(
    tools.openThread(request.value).pipe(
      Effect.match({
        onSuccess: (thread) => toolText(formatOpenedThread(thread)),
        onFailure: (failed) => toolText(failed.reason, true),
      }),
    ),
  )
}

/** The answer to one JSON-RPC message, or `undefined` for a notification. */
const answer = (tools: HumanityTools, message: unknown): Effect.Effect<unknown> => {
  if (!isRecord(message) || message["jsonrpc"] !== "2.0" || typeof message["method"] !== "string") {
    // A response from the client (to a request this server never makes) needs no answer either.
    return Effect.succeed(
      isRecord(message) && ("result" in message || "error" in message)
        ? undefined
        : error(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 request."),
    )
  }
  const rawId = message["id"]
  if (rawId === undefined) return Effect.succeed(undefined)
  const id: JsonRpcId = typeof rawId === "string" || typeof rawId === "number" ? rawId : null
  const params = isRecord(message["params"]) ? message["params"] : {}
  switch (message["method"]) {
    case "initialize": {
      const asked = params["protocolVersion"]
      const protocolVersion =
        typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : PROTOCOL_VERSIONS[0]
      return Effect.succeed(
        result(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: HUMANITY_MCP_SERVER, title: "Humanity", version: "0.1.0" },
        }),
      )
    }
    case "ping":
      return Effect.succeed(result(id, {}))
    case "tools/list":
      return Effect.succeed(result(id, { tools: [OPEN_THREAD_TOOL_DEFINITION] }))
    case "tools/call":
      return Option.match(callTool(tools, params), {
        onNone: () =>
          Effect.succeed(error(id, INVALID_PARAMS, `Unknown tool: ${String(params["name"])}`)),
        onSome: (called) => Effect.map(called, (value) => result(id, value)),
      })
    default:
      return Effect.succeed(error(id, METHOD_NOT_FOUND, `Method not found: ${message["method"]}`))
  }
}

/**
 * Answers the body of one POST from the agent of the thread `tools` belong
 * to: a message, or a batch of them. Notifications alone get `202 Accepted`.
 */
export const answerMcp = (tools: HumanityTools, body: unknown): Effect.Effect<McpReply> => {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return Effect.succeed({ status: 400, body: error(null, INVALID_REQUEST, "Empty batch.") })
    }
    return Effect.map(
      Effect.forEach(body, (message) => answer(tools, message)),
      (answers): McpReply => {
        const said = answers.filter((each) => each !== undefined)
        return said.length === 0 ? { status: 202 } : { status: 200, body: said }
      },
    )
  }
  return Effect.map(answer(tools, body), (said): McpReply =>
    said === undefined ? { status: 202 } : { status: 200, body: said },
  )
}

/** The reply to a body that is not JSON. */
export const MCP_PARSE_ERROR: McpReply = {
  status: 400,
  body: error(null, PARSE_ERROR, "The body is not JSON."),
}

const BEARER = "Bearer "

export class HumanityMcp extends Context.Service<
  HumanityMcp,
  {
    /**
     * Humanity's MCP server for one thread, as the agent is given it, for as
     * long as the scope is open: its tools then act for that thread.
     */
    readonly serve: (tools: HumanityTools) => Effect.Effect<AgentMcpServer, never, Scope.Scope>
    /**
     * The tools of the thread an `Authorization` header stands for;
     * `undefined` when it stands for none, or for one whose agent has stopped.
     */
    readonly toolsFor: (authorization: string | undefined) => HumanityTools | undefined
  }
>()("humanity/HumanityMcp") {
  /** Served by this daemon, at the address it listens on. */
  static readonly layer = Layer.effect(
    HumanityMcp,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const url = `http://${config.host}:${config.port}${MCP_PATH}`
      const threads = new Map<string, HumanityTools>()

      const serve = (tools: HumanityTools) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const token = randomBytes(32).toString("base64url")
            threads.set(token, tools)
            return token
          }),
          (token) => Effect.sync(() => threads.delete(token)),
        ).pipe(
          Effect.map((token): AgentMcpServer => ({
            type: "http",
            url,
            headers: { Authorization: `${BEARER}${token}` },
          })),
        )

      const toolsFor = (authorization: string | undefined) =>
        authorization?.startsWith(BEARER) === true
          ? threads.get(authorization.slice(BEARER.length))
          : undefined

      return HumanityMcp.of({ serve, toolsFor })
    }),
  )
}
