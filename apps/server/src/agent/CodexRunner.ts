import {
  AUTO_TOOLS,
  type ContextUsage,
  HUMANITY_MCP_SERVER,
  MCP_REQUEST_TOOL,
  OPEN_THREAD_TOOL_NAME,
  parseMcpToolName,
  PATCH_TOOL,
  QUESTION_TOOL,
  type ReasoningEffort,
  SHELL_TOOL,
} from "@humanity/contracts"
import { type Cause, Deferred, Effect, Exit, Option, Queue, Scope, Stream } from "effect"
import {
  type AppServer,
  CodexFailed,
  type ServerMessage,
  type ServerReply,
} from "../codex/AppServer.ts"
import { readCodexPlanUsage } from "../codex/Codex.ts"
import {
  ApprovalRequest,
  ConfigResponse,
  ElicitationRequest,
  ItemNotification,
  ThreadResponse,
  type ThreadItem,
  type TokenBreakdown,
  TokenUsageUpdated,
  TurnResponse,
  UserInputRequest,
} from "../codex/protocol.ts"
import { decode } from "../unknown.ts"
import {
  type AgentExtensions,
  type AgentRun,
  AgentRunError,
  type AgentRunOptions,
  type AgentUserMessage,
} from "./AgentRunner.ts"
import { CODEX_READY, codexEvent, type CodexTurnUsage, patchInput } from "./normalizeCodex.ts"

export type CodexConnect = (options: {
  readonly codexHome?: string | undefined
  readonly cwd: string
  readonly onRequest: (request: ServerMessage) => Effect.Effect<ServerReply, CodexFailed>
}) => Effect.Effect<AppServer, CodexFailed, Scope.Scope>

const INSTRUCTIONS = `You are running inside Humanity, an app where a human runs coding agents in threads.
The human chooses how much each thread does on its own. Depending on that, a file change, shell command or MCP tool may wait for them to allow or deny it.
When a command or file change is declined, the message that follows is the human's decision and feedback. Follow it instead of retrying the same call.`

const OPEN_THREAD_INSTRUCTIONS = `
When the human asks you to open or start a new thread, use the ${OPEN_THREAD_TOOL_NAME} tool of the ${HUMANITY_MCP_SERVER} MCP server. Do not use it on your own initiative.`

export const codexInstructions = (offersOpenThread: boolean): string =>
  offersOpenThread ? INSTRUCTIONS + OPEN_THREAD_INSTRUCTIONS : INSTRUCTIONS

const APPROVAL_POLICY = "untrusted"
const APPROVALS_REVIEWER = "user"

const decodeThread = decode(ThreadResponse)
const decodeTurn = decode(TurnResponse)
const decodeConfig = decode(ConfigResponse)
const decodeUsage = decode(TokenUsageUpdated)
const decodeItem = decode(ItemNotification)
const decodeApproval = decode(ApprovalRequest)
const decodeUserInput = decode(UserInputRequest)
const decodeElicitation = decode(ElicitationRequest)

const threadIdOf = (params: unknown): string | undefined => {
  if (typeof params !== "object" || params === null) return undefined
  const id = (params as { readonly threadId?: unknown }).threadId
  return typeof id === "string" ? id : undefined
}

const textInput = (text: string) => ({ type: "text", text, text_elements: [] })

export const codexUserInput = (message: AgentUserMessage): ReadonlyArray<unknown> => {
  const images: Array<unknown> = []
  let text = message.text
  for (const file of message.attachments) {
    switch (file.kind) {
      case "image":
        images.push({ type: "image", url: `data:${file.mediaType};base64,${file.base64}` })
        break
      case "text":
        text += `\n\n<file name="${file.name}">\n${file.text}\n</file>`
        break
      case "pdf":
        text += `\n\n[The PDF ${file.name} was attached, but Codex cannot read PDF files.]`
        break
    }
  }
  return [...images, textInput(text)]
}

const humanityAutoTools: Record<string, unknown> = Object.fromEntries(
  AUTO_TOOLS.flatMap((toolName) => {
    const parsed = parseMcpToolName(toolName)
    return parsed?.server === HUMANITY_MCP_SERVER
      ? [[parsed.tool, { approval_mode: "approve" }] as const]
      : []
  }),
)

const mcpServerConfig = (
  extensions: AgentExtensions,
  configured: ReadonlyArray<string>,
): Record<string, unknown> => {
  const servers: Record<string, unknown> = {}
  for (const name of configured) servers[name] = { default_tools_approval_mode: "prompt" }
  for (const [name, server] of Object.entries(extensions.mcpServers)) {
    servers[name] = {
      ...(server.type === "stdio"
        ? { command: server.command, args: [...server.args], env: { ...server.env } }
        : {
            url: server.url,
            http_headers: { ...server.headers },
            ...(server.timeoutMs === undefined
              ? {}
              : { tool_timeout_sec: server.timeoutMs / 1000 }),
          }),
      default_tools_approval_mode: "prompt",
      ...(name === HUMANITY_MCP_SERVER ? { tools: humanityAutoTools } : {}),
    }
  }
  return servers
}

const asksForInput = (schema: unknown): boolean => {
  if (typeof schema !== "object" || schema === null) return false
  const properties = (schema as { readonly properties?: unknown }).properties
  return typeof properties === "object" && properties !== null && Object.keys(properties).length > 0
}

export const startCodexRun =
  (connect: CodexConnect) =>
  (options: AgentRunOptions): Effect.Effect<AgentRun, never, Scope.Scope> =>
    Effect.gen(function* () {
      const outer = yield* Effect.scope
      const own = yield* Scope.fork(outer)
      const outbox = yield* Queue.unbounded<unknown, AgentRunError | Cause.Done>()
      const inbox = yield* Queue.unbounded<AgentUserMessage>()
      yield* Effect.addFinalizer(() => Queue.end(outbox))
      const emit = (event: unknown) => Queue.offer(outbox, event).pipe(Effect.asVoid)

      const patches = new Map<string, ThreadItem>()
      let model = options.model
      let effort = options.effort
      let server: AppServer | undefined
      let threadId: string | undefined
      let turn:
        | { id: string | undefined; readonly done: Deferred.Deferred<void>; interrupt: boolean }
        | undefined
      let usage: (typeof TokenUsageUpdated.Type)["tokenUsage"] | undefined
      let usedBeforeTurn: TokenBreakdown | undefined
      let requests = 0

      const steer = (message: string) =>
        Effect.suspend(() => {
          const active = turn?.id
          if (server === undefined || threadId === undefined || active === undefined) {
            return Effect.void
          }
          return server
            .request("turn/steer", {
              threadId,
              expectedTurnId: active,
              input: [textInput(message)],
            })
            .pipe(Effect.ignore)
        })

      const approval = (toolName: string, input: Record<string, unknown>, toolUseId: string) =>
        Effect.map(options.canUseTool({ toolName, input, toolUseId }), (decision): ServerReply =>
          decision.behavior === "allow"
            ? { result: { decision: "accept" } }
            : { result: { decision: "decline" }, afterwards: steer(decision.message) },
        )

      const onRequest = (request: ServerMessage): Effect.Effect<ServerReply, CodexFailed> => {
        switch (request.method) {
          case "item/commandExecution/requestApproval": {
            const asked = decodeApproval(request.params)
            if (Option.isNone(asked)) return Effect.succeed({ result: { decision: "decline" } })
            const { itemId, command, cwd, reason } = asked.value
            return approval(
              SHELL_TOOL,
              {
                command: command ?? "",
                ...(typeof cwd === "string" ? { cwd } : {}),
                ...(typeof reason === "string" ? { description: reason } : {}),
              },
              itemId,
            )
          }
          case "item/fileChange/requestApproval": {
            const asked = decodeApproval(request.params)
            const changes = Option.isSome(asked)
              ? patches.get(asked.value.itemId)?.changes
              : undefined
            if (Option.isNone(asked) || changes === undefined) {
              return Effect.succeed({
                result: { decision: "decline" },
                afterwards: steer("NOT APPLIED: Humanity could not read this file change."),
              })
            }
            return approval(PATCH_TOOL, patchInput(changes), asked.value.itemId)
          }
          case "item/tool/requestUserInput": {
            const asked = decodeUserInput(request.params)
            if (Option.isNone(asked) || asked.value.questions.length === 0) {
              return Effect.succeed({ result: { answers: {} } })
            }
            const { itemId, questions } = asked.value
            const input = {
              questions: questions.map((question) => ({
                question: question.question,
                header: question.header,
                options: question.options ?? [],
              })),
            }
            return Effect.map(
              options.canUseTool({ toolName: QUESTION_TOOL, input, toolUseId: itemId }),
              (decision): ServerReply => {
                if (decision.behavior === "deny") {
                  return { result: { answers: {} }, afterwards: steer(decision.message) }
                }
                const given = (decision.updatedInput?.["answers"] ?? {}) as Record<string, unknown>
                const answers: Record<string, { answers: Array<string> }> = {}
                for (const question of questions) {
                  const answer = given[question.question]
                  if (typeof answer === "string") answers[question.id] = { answers: [answer] }
                }
                return { result: { answers } }
              },
            )
          }
          case "mcpServer/elicitation/request": {
            const asked = decodeElicitation(request.params)
            const decline: ServerReply = {
              result: { action: "decline", content: null, _meta: null },
            }
            if (Option.isNone(asked)) return Effect.succeed(decline)
            const { serverName, mode, message, requestedSchema } = asked.value
            if (mode !== "form" || asksForInput(requestedSchema)) return Effect.succeed(decline)
            return Effect.map(
              options.canUseTool({
                toolName: MCP_REQUEST_TOOL,
                input: { server: serverName, message: message ?? "" },
                toolUseId: `mcp-request-${++requests}`,
              }),
              (decision): ServerReply =>
                decision.behavior === "allow"
                  ? { result: { action: "accept", content: {}, _meta: null } }
                  : { ...decline, afterwards: steer(decision.message) },
            )
          }
          case "item/permissions/requestApproval":
            return Effect.succeed({ result: { permissions: {}, scope: "turn" } })
          case "execCommandApproval":
          case "applyPatchApproval":
            return Effect.succeed({ result: { decision: "denied" } })
          default:
            return Effect.fail(
              new CodexFailed({ reason: `Humanity does not answer ${request.method}.` }),
            )
        }
      }

      const turnUsage = (): CodexTurnUsage | undefined => {
        if (usage === undefined) return undefined
        const now = usage.total
        const before = usedBeforeTurn
        return {
          inputTokens: now.inputTokens - (before?.inputTokens ?? 0),
          cachedInputTokens: now.cachedInputTokens - (before?.cachedInputTokens ?? 0),
          cacheWriteInputTokens:
            (now.cacheWriteInputTokens ?? 0) - (before?.cacheWriteInputTokens ?? 0),
          outputTokens: now.outputTokens - (before?.outputTokens ?? 0),
        }
      }

      const endTurn = Effect.suspend(() => {
        const ended = turn
        turn = undefined
        return ended === undefined ? Effect.void : Deferred.succeed(ended.done, undefined)
      })

      const onNotification = ({ method, params }: ServerMessage) =>
        Effect.gen(function* () {
          const from = threadIdOf(params)
          if (from !== undefined && from !== threadId) return
          switch (method) {
            case "turn/started": {
              const started = decodeTurn(params)
              if (Option.isSome(started) && turn !== undefined) turn.id ??= started.value.turn.id
              return
            }
            case "thread/tokenUsage/updated": {
              const updated = decodeUsage(params)
              if (Option.isSome(updated)) usage = updated.value.tokenUsage
              return
            }
            case "item/started": {
              const started = decodeItem(params)
              if (Option.isSome(started) && started.value.item.type === "fileChange") {
                patches.set(started.value.item.id, started.value.item)
              }
              return yield* emit(codexEvent(method, params))
            }
            case "item/completed": {
              const completed = decodeItem(params)
              if (Option.isSome(completed)) patches.delete(completed.value.item.id)
              return yield* emit(codexEvent(method, params))
            }
            case "item/agentMessage/delta":
              return yield* emit(codexEvent(method, params))
            case "turn/completed":
              yield* emit(codexEvent(method, params, turnUsage()))
              return yield* endTurn
          }
        })

      const interruptTurn = Effect.suspend(() => {
        if (turn === undefined) return Effect.void
        if (server === undefined || threadId === undefined || turn.id === undefined) {
          turn.interrupt = true
          return Effect.void
        }
        return server
          .request("turn/interrupt", { threadId, turnId: turn.id })
          .pipe(Effect.timeoutOption("10 seconds"), Effect.ignore)
      })

      const runTurn = (connected: AppServer, thread: string, message: AgentUserMessage) =>
        Effect.gen(function* () {
          const current = { id: undefined, done: yield* Deferred.make<void>(), interrupt: false }
          turn = current
          usedBeforeTurn = usage?.total
          const started = yield* Effect.result(
            connected.request("turn/start", {
              threadId: thread,
              input: codexUserInput(message),
              approvalPolicy: APPROVAL_POLICY,
              approvalsReviewer: APPROVALS_REVIEWER,
              sandboxPolicy: { type: "dangerFullAccess" },
              ...(model === undefined ? {} : { model }),
              ...(effort === undefined ? {} : { effort }),
            }),
          )
          if (started._tag === "Failure") {
            yield* emit(
              codexEvent("turn/completed", {
                turn: {
                  id: "",
                  status: "failed",
                  error: { message: started.failure.reason },
                  durationMs: 0,
                },
              }),
            )
            return yield* endTurn
          }
          const named = decodeTurn(started.success)
          if (Option.isSome(named) && turn === current) turn.id ??= named.value.turn.id
          if (current.interrupt) yield* interruptTurn
          yield* Deferred.await(current.done)
        })

      const main = Effect.gen(function* () {
        const connected = yield* connect({
          cwd: options.cwd,
          codexHome: options.configDir,
          onRequest,
        })
        server = connected
        const configured = yield* connected.request("config/read", { includeLayers: false }).pipe(
          Effect.map((response) =>
            Object.keys(Option.getOrUndefined(decodeConfig(response))?.config.mcp_servers ?? {}),
          ),
          Effect.orElseSucceed((): Array<string> => []),
        )
        const mcpServers = mcpServerConfig(options.extensions, configured)
        const settings = {
          cwd: options.cwd,
          approvalPolicy: APPROVAL_POLICY,
          approvalsReviewer: APPROVALS_REVIEWER,
          sandbox: "danger-full-access",
          developerInstructions: codexInstructions(options.offersOpenThread),
          ...(Object.keys(mcpServers).length === 0 ? {} : { config: { mcp_servers: mcpServers } }),
          ...(model === undefined ? {} : { model }),
        }
        const opened = decodeThread(
          options.resume === undefined
            ? yield* connected.request("thread/start", settings)
            : options.forkAt === undefined
              ? yield* connected.request("thread/resume", {
                  threadId: options.resume,
                  excludeTurns: true,
                  ...settings,
                })
              : yield* connected.request("thread/fork", {
                  threadId: options.resume,
                  lastTurnId: options.forkAt,
                  excludeTurns: true,
                  ...settings,
                }),
        )
        if (Option.isNone(opened)) {
          return yield* new CodexFailed({ reason: "Codex did not say which thread it opened." })
        }
        const thread = opened.value.thread.id
        threadId = thread
        yield* emit(codexEvent(CODEX_READY, { threadId: thread, model: opened.value.model }))

        yield* connected.notifications.pipe(
          Stream.runForEach(onNotification),
          Effect.catch((error) => Queue.fail(outbox, new AgentRunError({ message: error.reason }))),
          Effect.forkIn(own),
        )
        while (true) yield* runTurn(connected, thread, yield* Queue.take(inbox))
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
              message: "Codex reads its MCP servers when a thread starts; this one keeps its own.",
            }),
          ),
        contextUsage: Effect.sync((): ContextUsage | undefined => {
          const window = usage?.modelContextWindow
          return usage === undefined || typeof window !== "number" || window <= 0
            ? undefined
            : { usedTokens: usage.last.totalTokens, maxTokens: window }
        }),
        planUsage: Effect.suspend(() =>
          server === undefined
            ? Effect.succeed(undefined)
            : readCodexPlanUsage(server).pipe(
                Effect.timeoutOption("10 seconds"),
                Effect.map(Option.getOrUndefined),
                Effect.orElseSucceed(() => undefined),
              ),
        ),
      } satisfies AgentRun
    })
