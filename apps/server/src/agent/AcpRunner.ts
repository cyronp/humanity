import type { ContextUsage, ReasoningEffort } from "@humanity/contracts"
import { type Cause, Clock, Deferred, Effect, Exit, Option, Queue, Scope, Stream } from "effect"
import { type AcpConnection, AcpFailed, type AgentMessage } from "../acp/Connection.ts"
import {
  ChunkUpdate,
  type ConfigOption,
  ConfigOptionUpdate,
  decode,
  type InitializeResponse,
  PermissionRequest,
  PromptResponse,
  SessionResponse,
  SessionUpdate,
  ToolCallFields,
  UsageUpdate,
} from "../acp/protocol.ts"
import {
  type AgentExtensions,
  type AgentRun,
  AgentRunError,
  type AgentRunOptions,
  type AgentUserMessage,
} from "./AgentRunner.ts"
import {
  ACP_READY,
  ACP_TEXT,
  ACP_TEXT_DELTA,
  ACP_THOUGHT,
  ACP_TOOL_COMPLETED,
  ACP_TOOL_STARTED,
  ACP_TURN_COMPLETED,
  acpEvent,
  acpToolCall,
  acpToolOutput,
  type AcpTurnCompleted,
  type NamedTool,
} from "./normalizeAcp.ts"

/** Starts an ACP agent in a folder; the real one, or a scripted one in tests. */
export type AcpConnect = (options: {
  /** The config folder of the account the thread runs as; without it, the agent's default login. */
  readonly configDir?: string | undefined
  readonly cwd: string
  readonly onRequest: (request: AgentMessage) => Effect.Effect<unknown, AcpFailed>
  readonly onNotification: (notification: AgentMessage) => Effect.Effect<void>
}) => Effect.Effect<AcpConnection, AcpFailed, Scope.Scope>

/** What one agent does its own way, on top of the protocol every ACP agent speaks. */
export interface AcpProfile {
  /** The agent as the human knows it, e.g. `Kiro`. */
  readonly product: string
  /**
   * Names a tool call the agent's own way (an MCP tool, say), before the
   * protocol's kinds are tried.
   */
  readonly toolCall?: (call: ToolCallFields) => NamedTool | undefined
  /**
   * Says something to the agent while its turn runs. The protocol's answer to
   * a declined call carries no message; an agent without this hears the
   * human's reason with their next message.
   */
  readonly steer?: (
    connection: AcpConnection,
    sessionId: string,
    message: string,
  ) => Effect.Effect<void, AcpFailed>
}

const MODEL_OPTION = { category: "model", ids: ["model"] }
const EFFORT_OPTION = {
  category: "thought_level",
  ids: ["thought_level", "effortLevel", "effort", "reasoning_effort"],
}

const decodeSession = decode(SessionResponse)
const decodeUpdate = decode(SessionUpdate)
const decodeChunk = decode(ChunkUpdate)
const decodeToolCall = decode(ToolCallFields)
const decodeUsage = decode(UsageUpdate)
const decodeConfigUpdate = decode(ConfigOptionUpdate)
const decodePermission = decode(PermissionRequest)
const decodePrompt = decode(PromptResponse)

const CANCELLED = { outcome: { outcome: "cancelled" } }
const selected = (optionId: string) => ({ outcome: { outcome: "selected", optionId } })

const nameValues = (record: Readonly<Record<string, string>>) =>
  Object.entries(record).map(([name, value]) => ({ name, value }))

/**
 * Humanity's MCP servers as `session/new` takes them. Every agent runs a
 * server it starts itself; one reached over the network only when the agent
 * says it can.
 */
export const acpMcpServers = (
  extensions: AgentExtensions,
  agent: InitializeResponse,
): ReadonlyArray<unknown> => {
  const can = agent.agentCapabilities?.mcpCapabilities
  const servers: Array<unknown> = []
  for (const [name, server] of Object.entries(extensions.mcpServers)) {
    if (server.type === "stdio") {
      servers.push({
        name,
        command: server.command,
        args: [...server.args],
        env: nameValues(server.env),
      })
    } else if (can?.[server.type] === true) {
      servers.push({
        type: server.type,
        name,
        url: server.url,
        headers: nameValues(server.headers),
      })
    }
  }
  return servers
}

/**
 * A user message as an ACP prompt: images first, where the agent takes them,
 * then the text with any text files inline. `notes` are what the agent was
 * not told when a call of its last turn was declined.
 */
export const acpPrompt = (
  message: AgentUserMessage,
  options: { readonly images: boolean; readonly notes?: ReadonlyArray<string> },
): ReadonlyArray<unknown> => {
  const images: Array<unknown> = []
  let text = message.text
  for (const file of message.attachments) {
    switch (file.kind) {
      case "image":
        if (options.images) {
          images.push({ type: "image", data: file.base64, mimeType: file.mediaType })
        } else {
          text += `\n\n[The image ${file.name} was attached, but this agent cannot read images.]`
        }
        break
      case "text":
        text += `\n\n<file name="${file.name}">\n${file.text}\n</file>`
        break
      case "pdf":
        text += `\n\n[The PDF ${file.name} was attached, but this agent cannot read PDF files.]`
        break
    }
  }
  const notes = options.notes ?? []
  if (notes.length > 0) {
    text = `[About calls that were declined in your last turn]\n${notes.join("\n")}\n\n${text}`
  }
  return [...images, { type: "text", text }]
}

/** Later fields replace earlier ones; a field an update leaves out keeps its value. */
const merge = (known: ToolCallFields | undefined, update: ToolCallFields): ToolCallFields => {
  if (known === undefined) return update
  const merged: Record<string, unknown> = { ...known }
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined && value !== null) merged[key] = value
  }
  return merged as unknown as ToolCallFields
}

interface TrackedTool {
  fields: ToolCallFields
  /** Whether Humanity was told the call began. */
  started: boolean
}

/**
 * One conversation with an ACP agent on its own process. Messages queue like
 * they do for the other agents: each starts a turn when the one before it is
 * over. Humanity decides only what the agent asks about, so an agent's own
 * settings must make it ask; that is the business of whoever starts it.
 */
export const startAcpRun =
  (connect: AcpConnect, profile: AcpProfile) =>
  (options: AgentRunOptions): Effect.Effect<AgentRun, never, Scope.Scope> =>
    Effect.gen(function* () {
      const { product } = profile
      const outer = yield* Effect.scope
      // Closed early when the agent cannot start, so no process lingers behind a failed run.
      const own = yield* Scope.fork(outer)
      const outbox = yield* Queue.unbounded<unknown, AgentRunError | Cause.Done>()
      const inbox = yield* Queue.unbounded<AgentUserMessage>()
      yield* Effect.addFinalizer(() => Queue.end(outbox))
      const emit = (method: string, params: unknown) =>
        Queue.offer(outbox, acpEvent(method, params)).pipe(Effect.asVoid)

      const tools = new Map<string, TrackedTool>()
      /** What a declined call's answer could not tell the agent, for its next prompt. */
      const notes: Array<string> = []
      let model = options.model
      let effort = options.effort
      let connection: AcpConnection | undefined
      let sessionId: string | undefined
      /** The agent is replaying a reopened session's history, which Humanity already has. */
      let replaying = false
      let configOptions: ReadonlyArray<ConfigOption> = []
      let context: ContextUsage | undefined
      let turn: { readonly cancelled: Deferred.Deferred<void> } | undefined
      let text = ""
      let thought = ""

      const flushThought = Effect.suspend(() => {
        const said = thought
        thought = ""
        return said === "" ? Effect.void : emit(ACP_THOUGHT, { text: said })
      })
      const flushText = Effect.suspend(() => {
        const said = text
        text = ""
        return said === "" ? Effect.void : emit(ACP_TEXT, { text: said })
      })
      const flush = Effect.andThen(flushThought, flushText)

      const named = (call: ToolCallFields): NamedTool =>
        profile.toolCall?.(call) ?? acpToolCall(call)

      const startTool = (tool: TrackedTool) =>
        Effect.suspend(() => {
          if (tool.started) return Effect.void
          tool.started = true
          const { toolCallId } = tool.fields
          return Effect.andThen(
            flush,
            emit(ACP_TOOL_STARTED, { toolCallId, ...named(tool.fields), call: tool.fields }),
          )
        })

      /**
       * A call is shown once it runs, is asked about or is over, not when it is
       * first announced: by then the agent has said what it is.
       */
      const onToolCall = (update: ToolCallFields) =>
        Effect.gen(function* () {
          const known = tools.get(update.toolCallId)
          const tool = known ?? { fields: update, started: false }
          tool.fields = merge(known?.fields, update)
          tools.set(update.toolCallId, tool)
          const { status, toolCallId } = tool.fields
          if (status !== "in_progress" && status !== "completed" && status !== "failed") return
          yield* startTool(tool)
          if (status === "in_progress") return
          tools.delete(toolCallId)
          yield* emit(ACP_TOOL_COMPLETED, {
            toolCallId,
            content: acpToolOutput(tool.fields),
            isError: status === "failed",
            call: tool.fields,
          })
        })

      /** Tells the agent why a call was declined: its own answer carries no message. */
      const explain = (message: string) =>
        Effect.suspend(() => {
          if (profile.steer === undefined || connection === undefined || sessionId === undefined) {
            notes.push(message)
            return Effect.void
          }
          return profile
            .steer(connection, sessionId, message)
            .pipe(Effect.catch(() => Effect.sync(() => void notes.push(message))))
        })

      const onPermission = (params: unknown) =>
        Effect.gen(function* () {
          const asked = decodePermission(params)
          if (Option.isNone(asked) || asked.value.sessionId !== sessionId) return CANCELLED
          const { toolCall, options: offered } = asked.value
          const known = tools.get(toolCall.toolCallId)
          const tool = known ?? { fields: toolCall, started: false }
          tool.fields = merge(known?.fields, toolCall)
          tools.set(toolCall.toolCallId, tool)
          yield* startTool(tool)

          const decision = yield* Effect.raceFirst(
            options.canUseTool({ ...named(tool.fields), toolUseId: toolCall.toolCallId }),
            // An interrupted turn takes its questions with it.
            turn === undefined
              ? Effect.never
              : Effect.as(Deferred.await(turn.cancelled), undefined),
          )
          if (decision === undefined) return CANCELLED
          const option = (kind: string) => offered.find((entry) => entry.kind === kind)?.optionId
          if (decision.behavior === "deny") {
            yield* explain(decision.message)
            const reject = option("reject_once")
            return reject === undefined ? CANCELLED : selected(reject)
          }
          // Only ever once: an agent's "always" is a rule of its own that outlives the thread.
          const allow = option("allow_once")
          if (allow === undefined) {
            yield* explain(
              `NOT RUN: ${product} offered no way to allow this call once, and Humanity does not save permissions with ${product}.`,
            )
            return CANCELLED
          }
          return selected(allow)
        })

      const onRequest = (request: AgentMessage): Effect.Effect<unknown, AcpFailed> =>
        request.method === "session/request_permission"
          ? onPermission(request.params)
          : Effect.fail(
              new AcpFailed({
                reason: `Humanity does not answer ${request.method}.`,
                unsupported: true,
              }),
            )

      const onNotification = ({ method, params }: AgentMessage) =>
        Effect.gen(function* () {
          if (method !== "session/update" || replaying) return
          const notified = decodeUpdate(params)
          // A session the agent runs on the side has an id of its own; only this one is the conversation.
          if (Option.isNone(notified) || notified.value.sessionId !== sessionId) return
          const update = (params as { readonly update: unknown }).update
          switch (notified.value.update.sessionUpdate) {
            case "agent_message_chunk": {
              const chunk = Option.getOrUndefined(decodeChunk(update))?.content.text ?? ""
              if (chunk === "") return
              yield* flushThought
              text += chunk
              return yield* emit(ACP_TEXT_DELTA, { text: chunk })
            }
            case "agent_thought_chunk": {
              const chunk = Option.getOrUndefined(decodeChunk(update))?.content.text ?? ""
              if (chunk === "") return
              yield* flushText
              thought += chunk
              return
            }
            case "tool_call":
            case "tool_call_update": {
              const call = decodeToolCall(update)
              if (Option.isSome(call)) yield* onToolCall(call.value)
              return
            }
            case "usage_update": {
              const usage = decodeUsage(update)
              if (Option.isSome(usage) && usage.value.size > 0) {
                context = { usedTokens: usage.value.used, maxTokens: usage.value.size }
              }
              return
            }
            case "config_option_update": {
              const changed = decodeConfigUpdate(update)
              if (Option.isSome(changed)) configOptions = changed.value.configOptions
              return
            }
          }
        })

      const optionFor = (kind: {
        readonly category: string
        readonly ids: ReadonlyArray<string>
      }) =>
        configOptions.find((option) => option.category === kind.category) ??
        configOptions.find((option) => kind.ids.includes(option.id))

      /** Sets an option the agent offers to the thread's choice, when it is not there already. */
      const choose = (
        connected: AcpConnection,
        session: string,
        kind: { readonly category: string; readonly ids: ReadonlyArray<string> },
        value: string | undefined,
      ) =>
        Effect.gen(function* () {
          const option = optionFor(kind)
          if (value === undefined || option === undefined || option.currentValue === value) return
          const response = yield* connected.request("session/set_config_option", {
            sessionId: session,
            configId: option.id,
            value,
          })
          const now = Option.getOrUndefined(decodeSession(response))?.configOptions
          if (now !== null && now !== undefined) configOptions = now
        })

      const interruptTurn = Effect.suspend(() => {
        if (turn === undefined) return Effect.void
        const stop = Deferred.succeed(turn.cancelled, undefined)
        return connection === undefined || sessionId === undefined
          ? stop
          : Effect.andThen(stop, connection.notify("session/cancel", { sessionId }))
      })

      const runTurn = (connected: AcpConnection, session: string, message: AgentUserMessage) =>
        Effect.gen(function* () {
          const current = { cancelled: yield* Deferred.make<void>() }
          turn = current
          const startedAt = yield* Clock.currentTimeMillis
          const told = notes.splice(0)
          const answered = yield* Effect.result(
            Effect.gen(function* () {
              yield* choose(connected, session, MODEL_OPTION, model)
              // An agent that names its levels otherwise keeps its own.
              yield* Effect.ignore(choose(connected, session, EFFORT_OPTION, effort))
              if (yield* Deferred.isDone(current.cancelled)) return { stopReason: "cancelled" }
              return yield* connected.request("session/prompt", {
                sessionId: session,
                prompt: acpPrompt(message, {
                  images: connected.agent.agentCapabilities?.promptCapabilities?.image === true,
                  notes: told,
                }),
              })
            }),
          )
          yield* flush
          // What never ran is not shown; what ran and was never said to end stays as it is.
          tools.clear()
          turn = undefined
          const prompted =
            answered._tag === "Success"
              ? Option.getOrUndefined(decodePrompt(answered.success))
              : undefined
          const usage = prompted?.usage
          yield* emit(ACP_TURN_COMPLETED, {
            stopReason:
              prompted?.stopReason ?? (answered._tag === "Success" ? "end_turn" : "failed"),
            error: answered._tag === "Failure" ? answered.failure.reason : null,
            durationMs: (yield* Clock.currentTimeMillis) - startedAt,
            usage:
              usage === null || usage === undefined
                ? null
                : {
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    cachedReadTokens: usage.cachedReadTokens ?? 0,
                    cachedWriteTokens: usage.cachedWriteTokens ?? 0,
                  },
          } satisfies AcpTurnCompleted)
        })

      /** Reopens the thread's session: without a replay where the agent can, ignoring it where not. */
      const reopen = (connected: AcpConnection, session: string, settings: object) =>
        Effect.gen(function* () {
          const can = connected.agent.agentCapabilities
          const resumes =
            can?.sessionCapabilities?.resume !== undefined &&
            can.sessionCapabilities.resume !== null
          if (!resumes && can?.loadSession !== true) {
            return yield* new AcpFailed({
              reason: `${product} cannot reopen a conversation it has closed. Start a new thread.`,
            })
          }
          sessionId = session
          replaying = true
          const response = yield* connected
            .request(resumes ? "session/resume" : "session/load", {
              sessionId: session,
              ...settings,
            })
            .pipe(Effect.ensuring(Effect.sync(() => void (replaying = false))))
          return Option.getOrUndefined(decodeSession(response))
        })

      const main = Effect.gen(function* () {
        const connected = yield* connect({
          cwd: options.cwd,
          configDir: options.configDir,
          onRequest,
          onNotification,
        })
        connection = connected
        const settings = {
          cwd: options.cwd,
          mcpServers: acpMcpServers(options.extensions, connected.agent),
        }
        const opened =
          options.resume === undefined
            ? Option.getOrUndefined(
                decodeSession(yield* connected.request("session/new", settings)),
              )
            : yield* reopen(connected, options.resume, settings)
        const session = options.resume ?? opened?.sessionId ?? undefined
        if (session === undefined) {
          return yield* new AcpFailed({ reason: `${product} did not say which session it opened.` })
        }
        sessionId = session
        configOptions = opened?.configOptions ?? []
        const running = optionFor(MODEL_OPTION)?.currentValue
        yield* emit(ACP_READY, {
          sessionId: session,
          model: model ?? (typeof running === "string" ? running : ""),
        })

        yield* connected.stopped.pipe(
          Effect.catch((error) => Queue.fail(outbox, new AgentRunError({ message: error.reason }))),
          Effect.forkIn(own),
        )
        while (true) yield* runTurn(connected, session, yield* Queue.take(inbox))
      })

      yield* main.pipe(
        Effect.catch((error) =>
          Queue.fail(outbox, new AgentRunError({ message: error.reason })).pipe(
            Effect.andThen(Effect.forkIn(Scope.close(own, Exit.void), outer)),
          ),
        ),
        Scope.provide(own),
        Effect.forkIn(own),
      )

      return {
        messages: Stream.fromQueue(outbox),
        send: (message: AgentUserMessage) => Queue.offer(inbox, message).pipe(Effect.asVoid),
        interrupt: interruptTurn,
        // Both are options of the session, set before the next turn starts.
        setModel: (next: string | undefined) =>
          Effect.sync(() => {
            model = next
          }),
        setEffort: (next: ReasoningEffort | undefined) =>
          Effect.sync(() => {
            effort = next
          }),
        applyExtensions: () =>
          Effect.fail(
            new AgentRunError({
              message: `${product} reads its MCP servers when a thread starts; this one keeps its own.`,
            }),
          ),
        contextUsage: Effect.sync(() => context),
        planUsage: Effect.succeed(undefined),
      } satisfies AgentRun
    })
