import type { ContextUsage, ReasoningEffort } from "@humanity/contracts"
import {
  type Cause,
  Clock,
  Deferred,
  type Duration,
  Effect,
  Exit,
  Option,
  Queue,
  Scope,
  Stream,
} from "effect"
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

/** One `session/update` as the agent wrote it: its kind, and whatever else it carries. */
export type AcpUpdate = Readonly<Record<string, unknown>> & { readonly sessionUpdate: string }

/**
 * What one agent does its own way, on top of the protocol every ACP agent
 * speaks. Made anew for each run, so it can remember what the run has seen.
 */
export interface AcpProfile {
  /** The agent as the human knows it, e.g. `Kiro`. */
  readonly product: string
  /**
   * Names a tool call the agent's own way (an MCP tool, a file change it
   * describes without a diff), before the protocol's kinds are tried.
   */
  readonly toolCall?: (call: ToolCallFields) => Effect.Effect<NamedTool | undefined>
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
  /**
   * Settings a session must hold before it is prompted: the agent's own that
   * make it ask before it acts. A session that lists one and cannot be set to
   * it does not run.
   */
  readonly settings?: ReadonlyArray<{ readonly id: string; readonly value: string }>
  /**
   * The id of the model setting, for an agent that lists it (and the reasoning
   * effort with it) only once a model has been written to the session.
   */
  readonly lateModelOption?: string
  /** Reads an update before the run does: changed, or `undefined` for one that is not shown. */
  readonly update?: (update: AcpUpdate) => AcpUpdate | undefined
  /**
   * The sub-agent an update belongs to, for an agent that runs sub-agents
   * inside the session: `owner` on the call that started it.
   */
  readonly subtask?: (
    update: AcpUpdate,
  ) => { readonly id: string; readonly owner: boolean } | undefined
  /**
   * For an agent that drops a `session/cancel` sent before its turn has
   * begun: what shows that it has, and how long to wait for that at most.
   */
  readonly cancelHold?: {
    readonly started: (update: AcpUpdate) => boolean
    readonly atMost: Duration.Input
  }
  /**
   * The calls a permission request is about, when it asks again about calls
   * that already ran (a review of a turn's changes). Humanity answers it
   * itself when it allowed every one of them; `undefined` for any other request.
   */
  readonly review?: (request: unknown) => ReadonlyArray<string> | undefined
}

interface OptionKind {
  readonly category: string
  readonly ids: ReadonlyArray<string>
}
const MODEL_OPTION: OptionKind = { category: "model", ids: ["model"] }
const EFFORT_OPTION: OptionKind = {
  category: "thought_level",
  ids: ["thought_level", "effortLevel", "effort", "reasoning_effort"],
}
/** How long an agent gets to list the options that come with a model just written. */
const LATE_OPTIONS_WAIT = "2 seconds"

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

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

/**
 * The values a select setting offers, flat or in groups; `undefined` when the
 * agent lists them in no way Humanity reads.
 */
export const acpOptionValues = (option: ConfigOption): ReadonlyArray<string> | undefined => {
  if (!Array.isArray(option.options)) return undefined
  const values: Array<string> = []
  for (const entry of option.options as ReadonlyArray<unknown>) {
    if (!isRecord(entry)) continue
    if (typeof entry["value"] === "string") values.push(entry["value"])
    else if (Array.isArray(entry["options"])) {
      for (const choice of entry["options"] as ReadonlyArray<unknown>) {
        if (isRecord(choice) && typeof choice["value"] === "string") values.push(choice["value"])
      }
    }
  }
  return values
}

/** What an update adds to `_meta` joins what was there: agents send it piece by piece. */
const mergeMeta = (known: unknown, update: unknown): unknown => {
  if (!isRecord(known) || !isRecord(update)) return update
  const merged: Record<string, unknown> = { ...known }
  for (const [key, value] of Object.entries(update)) merged[key] = mergeMeta(known[key], value)
  return merged
}

/** Later fields replace earlier ones; a field an update leaves out keeps its value. */
const merge = (known: ToolCallFields | undefined, update: ToolCallFields): ToolCallFields => {
  if (known === undefined) return update
  const merged: Record<string, unknown> = { ...known }
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined || value === null) continue
    merged[key] = key === "_meta" ? mergeMeta(merged[key], value) : value
  }
  return merged as unknown as ToolCallFields
}

interface TrackedTool {
  fields: ToolCallFields
  /** Whether Humanity was told the call began. */
  started: boolean
  /** The call of the sub-agent this one belongs to. */
  parent: string | null
}

interface Turn {
  readonly cancelled: Deferred.Deferred<void>
  /** The agent has shown that the turn began, so a cancel now reaches it. */
  readonly begun: Deferred.Deferred<void>
  /** `session/prompt` went out: from here on a cancel has something to stop. */
  prompted: boolean
}

/**
 * One conversation with an ACP agent on its own process. Messages queue like
 * they do for the other agents: each starts a turn when the one before it is
 * over. Humanity decides only what the agent asks about, so an agent's own
 * settings must make it ask; that is the business of its profile.
 */
export const startAcpRun =
  (connect: AcpConnect, makeProfile: (run: { readonly cwd: string }) => AcpProfile) =>
  (options: AgentRunOptions): Effect.Effect<AgentRun, never, Scope.Scope> =>
    Effect.gen(function* () {
      const profile = makeProfile({ cwd: options.cwd })
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
      /** The call that started each running sub-agent, by the sub-agent's id. */
      const subtasks = new Map<string, string>()
      /** The calls of this turn Humanity allowed. */
      const allowed = new Set<string>()
      /** What a declined call's answer could not tell the agent, for its next prompt. */
      const notes: Array<string> = []
      let model = options.model
      let effort = options.effort
      let connection: AcpConnection | undefined
      let sessionId: string | undefined
      /** The agent is replaying a reopened session's history, which Humanity already has. */
      let replaying = false
      let configOptions: ReadonlyArray<ConfigOption> = []
      /** Whoever waits for the agent to list its options again. */
      let configWaiters: Array<Deferred.Deferred<void>> = []
      let context: ContextUsage | undefined
      let turn: Turn | undefined
      let text = ""
      let thought = ""

      const setConfigOptions = (now: ReadonlyArray<ConfigOption>) =>
        Effect.suspend(() => {
          configOptions = now
          const waiting = configWaiters
          configWaiters = []
          return Effect.forEach(waiting, (waiter) => Deferred.succeed(waiter, undefined), {
            discard: true,
          })
        })

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

      const named = (call: ToolCallFields): Effect.Effect<NamedTool> =>
        profile.toolCall === undefined
          ? Effect.sync(() => acpToolCall(call))
          : Effect.map(profile.toolCall(call), (own) => own ?? acpToolCall(call))

      const track = (update: ToolCallFields, parent: string | null = null): TrackedTool => {
        const known = tools.get(update.toolCallId)
        const tool = known ?? { fields: update, started: false, parent }
        tool.fields = merge(known?.fields, update)
        tools.set(update.toolCallId, tool)
        return tool
      }

      const startTool = (tool: TrackedTool) =>
        Effect.gen(function* () {
          if (tool.started) return
          tool.started = true
          const { toolCallId } = tool.fields
          const call = yield* named(tool.fields)
          yield* flush
          yield* emit(ACP_TOOL_STARTED, {
            toolCallId,
            ...call,
            parent: tool.parent,
            call: tool.fields,
          })
        })

      const finishTool = (tool: TrackedTool, content: string, isError: boolean) =>
        Effect.suspend(() => {
          const { toolCallId } = tool.fields
          tools.delete(toolCallId)
          for (const [id, owner] of subtasks) if (owner === toolCallId) subtasks.delete(id)
          return emit(ACP_TOOL_COMPLETED, {
            toolCallId,
            content,
            isError,
            parent: tool.parent,
            call: tool.fields,
          })
        })

      /**
       * A call is shown once it runs, is asked about or is over, not when it is
       * first announced: by then the agent has said what it is.
       */
      const onToolCall = (update: ToolCallFields, parent: string | null) =>
        Effect.gen(function* () {
          const tool = track(update, parent)
          const { status } = tool.fields
          if (status !== "in_progress" && status !== "completed" && status !== "failed") return
          yield* startTool(tool)
          if (status === "in_progress") return
          yield* finishTool(tool, acpToolOutput(tool.fields), status === "failed")
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
          const option = (kind: string) => offered.find((entry) => entry.kind === kind)?.optionId

          // A second question about calls Humanity already allowed has its answer.
          const reviewed = profile.review?.(params)
          const allowOnce = option("allow_once")
          if (
            reviewed !== undefined &&
            reviewed.length > 0 &&
            reviewed.every((id) => allowed.has(id)) &&
            allowOnce !== undefined
          ) {
            return selected(allowOnce)
          }

          const tool = track(toolCall)
          yield* startTool(tool)

          const decision = yield* Effect.raceFirst(
            Effect.flatMap(named(tool.fields), (call) =>
              options.canUseTool({ ...call, toolUseId: toolCall.toolCallId }),
            ),
            // An interrupted turn takes its questions with it.
            turn === undefined
              ? Effect.never
              : Effect.as(Deferred.await(turn.cancelled), undefined),
          )
          if (decision === undefined) return CANCELLED
          // The agent reports nothing more about a review: its answer is how it ended.
          const settle = (outcome: string) =>
            reviewed === undefined ? Effect.void : finishTool(tool, outcome, false)
          if (decision.behavior === "deny") {
            yield* explain(decision.message)
            yield* settle("Rejected.")
            const reject = option("reject_once")
            return reject === undefined ? CANCELLED : selected(reject)
          }
          // Only ever once: an agent's "always" is a rule of its own that outlives the thread.
          if (allowOnce === undefined) {
            yield* explain(
              `NOT RUN: ${product} offered no way to allow this call once, and Humanity does not save permissions with ${product}.`,
            )
            yield* settle("Not answered.")
            return CANCELLED
          }
          allowed.add(toolCall.toolCallId)
          yield* settle("Accepted.")
          return selected(allowOnce)
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
          if (method !== "session/update") return
          const notified = decodeUpdate(params)
          // A session the agent runs on the side has an id of its own; only this one is the conversation.
          if (Option.isNone(notified) || notified.value.sessionId !== sessionId) return
          const raw = (params as { readonly update: AcpUpdate }).update
          if (raw.sessionUpdate === "config_option_update") {
            const changed = decodeConfigUpdate(raw)
            if (Option.isSome(changed)) yield* setConfigOptions(changed.value.configOptions)
            return
          }
          if (replaying) return
          if (turn !== undefined && profile.cancelHold?.started(raw) === true) {
            yield* Deferred.succeed(turn.begun, undefined)
          }
          const update = profile.update === undefined ? raw : profile.update(raw)
          if (update === undefined) return
          const subtask = profile.subtask?.(update)
          // What a sub-agent does is shown under the call that started it; what it says is that call's result.
          const inSubtask = subtask !== undefined && !subtask.owner
          switch (update.sessionUpdate) {
            case "agent_message_chunk": {
              const chunk = Option.getOrUndefined(decodeChunk(update))?.content.text ?? ""
              if (chunk === "" || inSubtask) return
              yield* flushThought
              text += chunk
              return yield* emit(ACP_TEXT_DELTA, { text: chunk })
            }
            case "agent_thought_chunk": {
              const chunk = Option.getOrUndefined(decodeChunk(update))?.content.text ?? ""
              if (chunk === "" || inSubtask) return
              yield* flushText
              thought += chunk
              return
            }
            case "tool_call":
            case "tool_call_update": {
              const call = decodeToolCall(update)
              if (Option.isNone(call)) return
              if (subtask?.owner === true) subtasks.set(subtask.id, call.value.toolCallId)
              return yield* onToolCall(
                call.value,
                inSubtask ? (subtasks.get(subtask.id) ?? null) : null,
              )
            }
            case "usage_update": {
              const usage = decodeUsage(update)
              if (Option.isSome(usage) && usage.value.size > 0) {
                context = { usedTokens: usage.value.used, maxTokens: usage.value.size }
              }
              return
            }
          }
        })

      const optionFor = (kind: OptionKind) =>
        configOptions.find((option) => option.category === kind.category) ??
        configOptions.find((option) => kind.ids.includes(option.id))

      const setOption = (connected: AcpConnection, session: string, id: string, value: string) =>
        Effect.gen(function* () {
          const response = yield* connected.request("session/set_config_option", {
            sessionId: session,
            configId: id,
            value,
          })
          const now = Option.getOrUndefined(decodeSession(response))?.configOptions
          if (now !== null && now !== undefined) yield* setConfigOptions(now)
        })

      /** Waits, but not for long, until the agent lists an option of this kind. */
      const awaitOption = (kind: OptionKind) =>
        Effect.gen(function* () {
          while (optionFor(kind) === undefined) {
            const changed = yield* Deferred.make<void>()
            configWaiters.push(changed)
            yield* Deferred.await(changed)
          }
        }).pipe(Effect.timeoutOption(LATE_OPTIONS_WAIT), Effect.asVoid)

      /**
       * Sets the session to the thread's model, when it is not there already.
       * Says whether a model was written, which is when an agent may list new options.
       */
      const chooseModel = (connected: AcpConnection, session: string) =>
        Effect.gen(function* () {
          if (model === undefined) return false
          const option = optionFor(MODEL_OPTION)
          const id = option?.id ?? profile.lateModelOption
          if (id === undefined || option?.currentValue === model) return false
          yield* setOption(connected, session, id, model)
          return true
        })

      /** Sets the reasoning effort, to a level the agent offers for the model it runs. */
      const chooseEffort = (connected: AcpConnection, session: string, modelWritten: boolean) =>
        Effect.gen(function* () {
          if (effort === undefined) return
          if (modelWritten && profile.lateModelOption !== undefined) {
            yield* awaitOption(EFFORT_OPTION)
          }
          const option = optionFor(EFFORT_OPTION)
          if (option === undefined || option.currentValue === effort) return
          const offered = acpOptionValues(option)
          if (offered !== undefined && offered.length > 0 && !offered.includes(effort)) return
          yield* setOption(connected, session, option.id, effort)
        })

      /**
       * Holds the session to the settings that make the agent ask. One the
       * session lists must take; one it does not list is tried all the same.
       */
      const holdSettings = (connected: AcpConnection, session: string) =>
        Effect.forEach(
          profile.settings ?? [],
          (setting) =>
            Effect.gen(function* () {
              const listed = configOptions.find((option) => option.id === setting.id)
              if (listed?.currentValue === setting.value) return
              const set = setOption(connected, session, setting.id, setting.value)
              if (listed === undefined) return yield* Effect.ignore(set)
              yield* set.pipe(
                Effect.mapError(
                  (error) =>
                    new AcpFailed({
                      reason: `${product} could not be set to ask before it acts (${setting.id}): ${error.reason}`,
                    }),
                ),
              )
              const now = configOptions.find((option) => option.id === setting.id)
              if (now !== undefined && now.currentValue !== setting.value) {
                return yield* new AcpFailed({
                  reason: `${product} did not keep the setting that makes it ask before it acts (${setting.id}).`,
                })
              }
            }),
          { discard: true },
        )

      const interruptTurn = Effect.suspend(() => {
        const current = turn
        if (current === undefined) return Effect.void
        const stop = Deferred.succeed(current.cancelled, undefined)
        const connected = connection
        // A turn not yet prompted sees that it was cancelled and never is.
        if (!current.prompted || connected === undefined || sessionId === undefined) return stop
        const cancel = connected.notify("session/cancel", { sessionId })
        const hold = profile.cancelHold
        if (hold === undefined) return Effect.andThen(stop, cancel)
        return Effect.andThen(
          stop,
          Deferred.await(current.begun).pipe(
            Effect.timeoutOption(hold.atMost),
            Effect.andThen(Effect.suspend(() => (turn === current ? cancel : Effect.void))),
            Effect.forkIn(own),
          ),
        )
      })

      const runTurn = (connected: AcpConnection, session: string, message: AgentUserMessage) =>
        Effect.gen(function* () {
          const current: Turn = {
            cancelled: yield* Deferred.make<void>(),
            begun: yield* Deferred.make<void>(),
            prompted: false,
          }
          turn = current
          const startedAt = yield* Clock.currentTimeMillis
          const told = notes.splice(0)
          const answered = yield* Effect.result(
            Effect.gen(function* () {
              yield* holdSettings(connected, session)
              const modelWritten = yield* chooseModel(connected, session)
              // An agent that names its levels otherwise keeps its own.
              yield* Effect.ignore(chooseEffort(connected, session, modelWritten))
              if (yield* Deferred.isDone(current.cancelled)) return { stopReason: "cancelled" }
              current.prompted = true
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
          subtasks.clear()
          allowed.clear()
          turn = undefined
          // A turn that never reached the agent did not tell it what was declined.
          if (!current.prompted) notes.unshift(...told)
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
        // A reopened session may have listed its options while it replayed, and not again after.
        const listed = opened?.configOptions
        if (listed !== null && listed !== undefined) yield* setConfigOptions(listed)
        // Before the thread is shown as ready: an agent that cannot be made to ask does not run.
        yield* holdSettings(connected, session)
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
