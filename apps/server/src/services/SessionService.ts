import {
  acceptsMessages,
  applyAutonomy,
  AUTO_TOOLS,
  type Attachment,
  type AttachmentContent,
  AttachmentNotFound,
  AttachmentRejected,
  type AttachmentUpload,
  type Autonomy,
  ChangeId,
  type ClaudeModel,
  DEFAULT_AUTONOMY,
  DEFAULT_CLAUDE_ACCOUNT,
  type ChatMessage,
  ConfirmationId,
  type ContextUsage,
  type GitBranchExists,
  type GitInvalidBranchName,
  type GitRefNotFound,
  type MessageContent,
  type OpenedThread,
  type PendingConfirmation,
  type PlanUsage,
  PlanUsageUnavailable,
  type Project,
  type ProjectNotFound,
  type ProposedChange,
  QUESTION_TOOL,
  type ReasoningEffort,
  type Session,
  SessionBusy,
  SessionEnded,
  type SessionEvent,
  SessionId,
  SessionNotFound,
  type SessionStatus,
  type SessionUsage,
  NothingToCommit,
  newThreadAutonomy,
  toolMode,
  type WorkingTreeDiff,
  type ToolCall,
} from "@humanity/contracts"
import { changeKind } from "@humanity/diff"
import {
  Context,
  DateTime,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Scope,
  Semaphore,
  Stream,
} from "effect"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import {
  type AgentRun,
  AgentRunner,
  OpenThreadFailed,
  type OpenThreadRequest,
  type PermissionDecision,
  type ToolPermissionRequest,
} from "../agent/AgentRunner.ts"
import { normalizeSdkMessage } from "../agent/normalize.ts"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { outsideWorktreeDenial, planChange, reviewTarget } from "../agent/review.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { type PreparedAttachment, prepareAttachments, toAgentAttachment } from "./attachments.ts"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { ApprovalService } from "./ApprovalService.ts"
import { type GitError, GitService } from "./GitService.ts"
import { ClaudeAccountService } from "./ClaudeAccountService.ts"
import { ExtensionsService } from "./ExtensionsService.ts"
import { PreferencesService } from "./PreferencesService.ts"
import { ProjectService } from "./ProjectService.ts"
import { SessionEvents } from "./SessionEvents.ts"

/** The agent process attached to a session while the daemon is running. */
interface ActiveRun {
  readonly run: AgentRun
  readonly scope: Scope.Closeable
  /** Set by `interrupt` so the turn's closing result reads as an interruption. */
  interrupted: boolean
  initSeen: boolean
  /** Tool calls Humanity denied, so their error results are shown as denials. */
  readonly denied: Set<string>
  /** One usage refresh at a time, so an older answer never overwrites a newer one. */
  readonly usageLock: Semaphore.Semaphore
  /** The change of Humanity's MCP servers and skills the agent last got. */
  extensionsVersion: number
}

/** `Fix the login bug!` → `fix-the-login-bug` */
export const slugify = (title: string): string =>
  title
    .normalize("NFKD")
    // Drop the accents NFKD split off: `Ü` becomes `U`, not `u-`.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "session"

/** `humanity/<short-id>-<slug>` */
export const sessionBranchName = (sessionId: string, title: string): string =>
  `humanity/${sessionId.slice(0, 8)}-${slugify(title)}`

/** `Claude Haiku 5.5`, `claude-haiku-5-5` and `haiku 5.5` → `haiku-5-5` */
const modelKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^claude-/, "")

/**
 * The model an agent asked for, as one of the values Claude Code offers the
 * account: by that value, or else by its name and version however they are
 * written (`Haiku 5.5` and `claude-haiku-5-5` are both the `haiku` alias when
 * that is how Claude Code lists Haiku 5.5). `undefined` when nothing matches.
 */
export const matchModel = (
  models: ReadonlyArray<ClaudeModel>,
  requested: string,
): string | undefined => {
  const wanted = requested.trim().toLowerCase()
  const exact = models.find((model) => model.value.toLowerCase() === wanted)
  if (exact !== undefined) return exact.value
  const key = modelKey(requested)
  if (key === "") return undefined
  return models.find(
    (model) => modelKey(model.value) === key || modelKey(model.displayName) === key,
  )?.value
}

export class SessionService extends Context.Service<
  SessionService,
  {
    readonly list: (projectId: string) => Effect.Effect<ReadonlyArray<Session>, ProjectNotFound>
    readonly get: (sessionId: string) => Effect.Effect<Session, SessionNotFound>
    /**
     * Starts a session in the project's checkout, switching it to `baseBranch`
     * first when one is given. No worktree until `setupWorktree`.
     */
    readonly create: (options: {
      readonly projectId: string
      readonly title?: string | undefined
      readonly baseBranch?: string | undefined
      readonly prompt?: string | undefined
      readonly attachments?: ReadonlyArray<AttachmentUpload> | undefined
      readonly model?: string | undefined
      readonly effort?: ReasoningEffort | undefined
      readonly autonomy?: Autonomy | undefined
    }) => Effect.Effect<
      Session,
      | ProjectNotFound
      | GitError
      | GitBranchExists
      | GitInvalidBranchName
      | GitRefNotFound
      | AttachmentRejected
    >
    /**
     * Moves the session from the project's checkout into its own branch and
     * worktree, between turns. The conversation resumes there.
     */
    readonly setupWorktree: (
      sessionId: string,
    ) => Effect.Effect<
      Session,
      | SessionNotFound
      | SessionEnded
      | SessionBusy
      | ProjectNotFound
      | GitError
      | GitBranchExists
      | GitInvalidBranchName
      | GitRefNotFound
    >
    /** Changes how much the agent may do without asking, from its next tool call on. */
    readonly setAutonomy: (
      sessionId: string,
      autonomy: Autonomy,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded>
    /**
     * Changes the model; `null` is Claude Code's default. A running agent
     * switches right away, otherwise the next run starts on it.
     */
    readonly setModel: (
      sessionId: string,
      model: string | null,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded>
    /**
     * Changes how hard the model reasons; `null` is the model's default. A
     * running agent switches right away, otherwise the next run starts on it.
     */
    readonly setEffort: (
      sessionId: string,
      effort: ReasoningEffort | null,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded>
    /** Sends a message, with files the agent receives inline (images, PDFs, text). */
    readonly sendMessage: (
      sessionId: string,
      text: string,
      attachments?: ReadonlyArray<AttachmentUpload>,
    ) => Effect.Effect<void, SessionNotFound | SessionEnded | AttachmentRejected>
    /** A stored attachment's bytes. */
    readonly attachment: (
      sessionId: string,
      attachmentId: string,
    ) => Effect.Effect<AttachmentContent, SessionNotFound | AttachmentNotFound>
    readonly interrupt: (sessionId: string) => Effect.Effect<void, SessionNotFound>
    /**
     * Reads the plan's usage right now (and the context, when an agent is
     * running), stores it and publishes `UsageUpdated`.
     */
    readonly refreshUsage: (
      sessionId: string,
    ) => Effect.Effect<SessionUsage, SessionNotFound | PlanUsageUnavailable>
    readonly end: (
      sessionId: string,
      options: { readonly removeWorktree: boolean },
    ) => Effect.Effect<Session, SessionNotFound | GitError>
    /** Stops every running agent of a project, before the project is removed. */
    readonly stopProject: (projectId: string) => Effect.Effect<void>
    /** Uncommitted changes where the session works: its worktree or the project's checkout. */
    readonly diff: (sessionId: string) => Effect.Effect<WorkingTreeDiff, SessionNotFound | GitError>
    /**
     * Commits everything where the session works to the branch checked out
     * there: what the agent changed, on its own or with the human's allow.
     */
    readonly commit: (
      sessionId: string,
      message: string,
    ) => Effect.Effect<string, SessionNotFound | SessionBusy | NothingToCommit | GitError>
    readonly subscribe: (sessionId: string) => Stream.Stream<SessionEvent, SessionNotFound>
    /** Every session of every project, again after each change. Most recently active first. */
    readonly watchAll: Stream.Stream<ReadonlyArray<Session>>
  }
>()("humanity/SessionService") {
  static readonly layer = Layer.effect(
    SessionService,
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const events = yield* SessionEvents
      const runner = yield* AgentRunner
      const projects = yield* ProjectService
      const git = yield* GitService
      const config = yield* ServerConfig
      const fs = yield* FileSystem.FileSystem
      const preferences = yield* PreferencesService
      const accounts = yield* ClaudeAccountService
      const extensions = yield* ExtensionsService
      const claude = yield* ClaudeCode
      const approvals = yield* ApprovalService
      const serviceScope = yield* Effect.scope

      const active = new Map<string, ActiveRun>()
      /**
       * Sessions that moved into a worktree since the agent last heard from
       * Humanity: the next message tells it where it works now.
       */
      const relocated = new Map<string, { readonly from: string; readonly to: string }>()
      const startLock = yield* Semaphore.make(1)

      const now = Effect.map(DateTime.now, DateTime.formatIso)

      const get = (sessionId: string) =>
        Effect.flatMap(repo.get(sessionId), (found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new SessionNotFound({ sessionId })),
            onSome: Effect.succeed,
          }),
        )

      const setStatus = (sessionId: string, status: SessionStatus, error: string | null = null) =>
        Effect.gen(function* () {
          yield* repo.update(sessionId, { status, updatedAt: yield* now })
          yield* events.publish(sessionId, { _tag: "SessionStatusChanged", status, error })
          yield* events.publishListChanged
        })

      const addMessage = (sessionId: string, content: MessageContent, raw?: unknown) =>
        Effect.gen(function* () {
          const message: ChatMessage = {
            id: randomUUID(),
            sessionId: SessionId.make(sessionId),
            content,
            createdAt: yield* now,
          }
          yield* repo.insertMessage(message, raw)
          yield* events.publish(sessionId, { _tag: "AgentMessage", message })
          return message
        })

      /** Shows the agent as blocked on the human while `waitForHuman` runs. */
      const whileWaiting = <A>(sessionId: string, waitForHuman: Effect.Effect<A>) =>
        Effect.gen(function* () {
          yield* setStatus(sessionId, "waiting_for_human")
          return yield* waitForHuman
        }).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              const pending = yield* approvals.pendingCount(sessionId)
              const session = yield* repo.get(sessionId)
              // An interrupt or a crash sets its own status; only an answered request resumes.
              if (
                pending === 0 &&
                Option.isSome(session) &&
                session.value.status === "waiting_for_human"
              ) {
                yield* setStatus(sessionId, "running")
              }
            }),
          ),
        )

      const confirm = (session: Session, request: ToolPermissionRequest) =>
        Effect.gen(function* () {
          const confirmation: PendingConfirmation = {
            id: ConfirmationId.make(randomUUID()),
            sessionId: session.id,
            toolUseId: request.toolUseId,
            toolName: request.toolName,
            input: request.input,
            status: "pending",
            createdAt: yield* now,
          }
          return yield* whileWaiting(session.id, approvals.requestConfirmation(confirmation))
        })

      /** A file change: simulate the edit, show its diff, wait for the human to allow or deny it. */
      const review = (session: Session, request: ToolPermissionRequest) =>
        Effect.gen(function* () {
          const target = reviewTarget(request.toolName, request.input, session.worktreePath)
          if (target._tag === "Confirm") return yield* confirm(session, request)
          if (target._tag === "Deny") {
            return { behavior: "deny", message: target.message } satisfies PermissionDecision
          }

          const exists = yield* fs
            .exists(target.absolutePath)
            .pipe(Effect.orElseSucceed(() => false))
          const originalContent = exists
            ? yield* fs.readFileString(target.absolutePath).pipe(Effect.orElseSucceed(() => null))
            : ""
          if (originalContent === null) {
            return {
              behavior: "deny",
              message: `NOT APPLIED: Humanity could not read ${target.filePath} to review the change.`,
            } satisfies PermissionDecision
          }

          const id = ChangeId.make(randomUUID())
          const plan = planChange({
            toolName: request.toolName,
            input: request.input,
            filePath: target.filePath,
            originalContent,
            idPrefix: id,
          })
          if (plan._tag === "Deny") {
            return { behavior: "deny", message: plan.message } satisfies PermissionDecision
          }

          const change: ProposedChange = {
            id,
            sessionId: session.id,
            toolUseId: request.toolUseId,
            toolName: request.toolName,
            filePath: target.filePath,
            kind: changeKind(exists),
            originalContent,
            proposedContent: plan.proposedContent,
            hunks: plan.hunks,
            status: "pending",
            createdAt: yield* now,
          }
          return yield* whileWaiting(session.id, approvals.requestChange(change))
        })

      /** The session's autonomy right now; the human can change it while the agent runs. */
      const currentAutonomy = (sessionId: string) =>
        Effect.map(repo.get(sessionId), (found) =>
          Option.match(found, {
            onNone: () => DEFAULT_AUTONOMY,
            onSome: (session) => session.autonomy,
          }),
        )

      /**
       * Every tool call that is not pre-approved lands here. The session's
       * autonomy is read fresh on each call, so a change applies to a running agent.
       */
      const decide =
        (session: Session, state: { readonly denied: Set<string> }) =>
        (request: ToolPermissionRequest): Effect.Effect<PermissionDecision> =>
          Effect.gen(function* () {
            const decision: PermissionDecision = yield* Effect.gen(function* () {
              const tool = toolMode(request.toolName)
              const autonomy = yield* currentAutonomy(session.id)
              // No amount of autonomy answers a question for the human.
              const mode =
                request.toolName === QUESTION_TOOL
                  ? tool
                  : approvals.allowsInSession(session.id, request.toolName)
                    ? "auto"
                    : applyAutonomy(autonomy, tool)
              switch (mode) {
                case "auto": {
                  // A file change let through without asking still stays inside the worktree.
                  const denial =
                    tool === "review"
                      ? outsideWorktreeDenial(request.toolName, request.input, session.worktreePath)
                      : undefined
                  return denial === undefined
                    ? ({ behavior: "allow" } as const)
                    : ({ behavior: "deny", message: denial } as const)
                }
                case "review":
                  return yield* review(session, request)
                case "confirm":
                  return yield* confirm(session, request)
              }
            })
            if (decision.behavior === "deny") state.denied.add(request.toolUseId)
            return decision
          })

      const startToolCalls = (session: Session, content: MessageContent) =>
        Effect.gen(function* () {
          if (content._tag !== "assistant") return
          for (const block of content.blocks) {
            if (block._tag !== "tool_use") continue
            const toolCall: ToolCall = {
              id: randomUUID(),
              sessionId: session.id,
              toolUseId: block.toolUseId,
              toolName: block.toolName,
              input: block.input,
              output: null,
              status: "running",
              startedAt: yield* now,
              finishedAt: null,
            }
            yield* repo.insertToolCall(toolCall)
            yield* events.publish(session.id, { _tag: "ToolCallStarted", toolCall })
            if (block.toolName === "Skill") {
              const skill = (block.input as { readonly skill?: unknown } | null)?.skill
              yield* events.publish(session.id, {
                _tag: "SkillLoaded",
                toolUseId: block.toolUseId,
                skill: typeof skill === "string" ? skill : "unknown",
                at: toolCall.startedAt,
              })
            }
          }
        })

      const finishToolCalls = (
        session: Session,
        state: ActiveRun,
        content: MessageContent,
        structured: unknown,
      ) =>
        Effect.gen(function* () {
          if (content._tag !== "tool_results") return
          for (const result of content.results) {
            const status = state.denied.has(result.toolUseId)
              ? "denied"
              : result.isError
                ? "failed"
                : "succeeded"
            const updated = yield* repo.finishToolCall(session.id, result.toolUseId, {
              status,
              output: result,
              structuredOutput: structured,
              finishedAt: yield* now,
            })
            if (Option.isSome(updated)) {
              yield* events.publish(session.id, {
                _tag: "ToolCallFinished",
                toolCall: updated.value,
              })
            }
          }
        })

      /**
       * Asks the agent how full its context window is and, with `withPlan`,
       * how much of the plan's rate-limit windows is used. What it cannot say
       * keeps the last known value.
       */
      const refreshUsage = (sessionId: string, state: ActiveRun, withPlan: boolean) =>
        state.usageLock.withPermits(1)(
          Effect.gen(function* () {
            const context = yield* state.run.contextUsage
            const plan = withPlan ? yield* state.run.planUsage : undefined
            return { plan, usage: yield* storeUsage(sessionId, context, plan) }
          }),
        )

      /** Stores and publishes what is known now; what is not keeps its last value. */
      const storeUsage = (
        sessionId: string,
        context: ContextUsage | undefined,
        plan: PlanUsage | undefined,
      ) =>
        Effect.gen(function* () {
          const known = yield* repo.getUsage(sessionId)
          if (context === undefined && plan === undefined) return known
          const usage: SessionUsage = {
            context: context ?? known.context,
            plan: plan ?? known.plan,
          }
          yield* repo.setUsage(sessionId, usage)
          yield* events.publish(sessionId, { _tag: "UsageUpdated", usage })
          return usage
        })

      /**
       * The plan's windows right now: from the running agent when the session
       * has one, otherwise from a Claude Code started idle on the session's
       * account just to ask, which sends nothing to the model.
       */
      const refreshUsageNow = Effect.fn("SessionService.refreshUsage")(function* (
        sessionId: string,
      ) {
        yield* get(sessionId)
        const unavailable = (reason: string) => new PlanUsageUnavailable({ reason })
        const state = active.get(sessionId)
        if (state !== undefined) {
          const { plan, usage } = yield* refreshUsage(sessionId, state, true)
          if (plan === undefined) {
            return yield* unavailable("the agent did not report the plan's limits.")
          }
          return usage
        }
        const configDir = yield* accounts.configDirFor(yield* repo.getAccountId(sessionId))
        const plan = yield* claude
          .planUsage(configDir)
          .pipe(Effect.mapError((error) => unavailable(error.reason)))
        if (plan === undefined) {
          return yield* unavailable("this login has no plan limits to report.")
        }
        return yield* storeUsage(sessionId, undefined, plan)
      })

      const handleRaw = (session: Session, state: ActiveRun) => (raw: unknown) =>
        Effect.gen(function* () {
          const normalized = normalizeSdkMessage(raw)
          if (normalized._tag === "Skip") return
          if (normalized._tag === "TextDelta") {
            yield* events.publish(session.id, { _tag: "TextDelta", text: normalized.text })
            return
          }
          const { content } = normalized

          if (content._tag === "system_init") {
            if (normalized.sdkSessionId !== undefined) {
              yield* repo.update(session.id, {
                sdkSessionId: normalized.sdkSessionId,
                updatedAt: yield* now,
              })
              const updated = yield* repo.get(session.id)
              if (Option.isSome(updated)) {
                yield* events.publish(session.id, {
                  _tag: "SessionUpdated",
                  session: updated.value,
                })
              }
            }
            // Init can repeat; one transcript entry per agent process is enough.
            if (state.initSeen) return
            state.initSeen = true
          }
          // The prompt was recorded when it was sent; the SDK's echoes add nothing.
          if (content._tag === "other" && content.type === "user") return

          yield* addMessage(session.id, content, raw)
          yield* startToolCalls(session, content)
          yield* finishToolCalls(session, state, content, normalized.structuredResult)

          // The context grows with each of the agent's own replies; the plan's
          // window is asked once per turn. Neither holds up the transcript.
          const turnEnded = content._tag === "result"
          if (turnEnded || (content._tag === "assistant" && content.parentToolUseId === null)) {
            yield* refreshUsage(session.id, state, turnEnded).pipe(Effect.forkIn(state.scope))
          }

          if (content._tag === "result") {
            if (state.interrupted) {
              yield* setStatus(session.id, "interrupted")
            } else if (content.isError) {
              yield* setStatus(
                session.id,
                "error",
                content.text ?? `The agent stopped: ${content.subtype}.`,
              )
            } else {
              yield* setStatus(session.id, "idle")
            }
            state.interrupted = false
          }
        })

      /** Ends the agent process attached to a session, if there is one. */
      const stopRun = (sessionId: string) =>
        Effect.gen(function* () {
          const state = active.get(sessionId)
          if (state === undefined) return
          active.delete(sessionId)
          yield* Scope.close(state.scope, Exit.void)
          // Anything the agent was still waiting on can no longer be answered.
          yield* approvals.expireSession(sessionId)
        })

      const ensureRun = (session: Session) =>
        startLock.withPermits(1)(
          Effect.gen(function* () {
            const existing = active.get(session.id)
            if (existing !== undefined) return existing

            const added = yield* extensions.forAgent
            const scope = yield* Scope.fork(serviceScope)
            const state: ActiveRun = {
              run: undefined as unknown as AgentRun,
              scope,
              interrupted: false,
              initSeen: false,
              denied: new Set(),
              usageLock: yield* Semaphore.make(1),
              extensionsVersion: added.version,
            }
            const run = yield* runner
              .start({
                cwd: session.worktreePath,
                configDir: yield* accounts.configDirFor(yield* repo.getAccountId(session.id)),
                resume: session.sdkSessionId ?? undefined,
                model: session.model ?? undefined,
                effort: session.effort ?? undefined,
                extensions: { mcpServers: added.mcpServers, plugins: added.plugins },
                allowedTools: AUTO_TOOLS,
                canUseTool: decide(session, state),
                openThread: openThread(session),
              })
              .pipe(Scope.provide(scope))
            const ready: ActiveRun = Object.assign(state, { run })
            active.set(session.id, ready)

            // Consume the agent's messages until the run ends or fails.
            yield* run.messages.pipe(
              Stream.runForEach(handleRaw(session, ready)),
              Effect.matchCauseEffect({
                onSuccess: () => Effect.void,
                onFailure: (cause) =>
                  Effect.gen(function* () {
                    const reason = Option.match(Exit.findErrorOption(Exit.failCause(cause)), {
                      onNone: () => "The agent process stopped unexpectedly.",
                      onSome: (error) => error.message,
                    })
                    yield* Effect.logWarning("agent run failed", { sessionId: session.id, reason })
                    yield* addMessage(session.id, { _tag: "notice", level: "error", text: reason })
                    yield* setStatus(session.id, "error", reason)
                  }),
              }),
              // A finished run is detached, so the next message starts a fresh one that resumes.
              Effect.ensuring(
                Effect.suspend(() =>
                  active.get(session.id) === ready
                    ? Effect.sync(() => active.delete(session.id))
                    : Effect.void,
                ),
              ),
              Effect.forkIn(scope),
            )
            return ready
          }),
        )

      const list = (projectId: string) =>
        Effect.flatMap(projects.get(projectId), () => repo.listByProject(projectId))

      /** Writes each file under `<attachmentsDir>/<sessionId>/` and records it. */
      const storeAttachments = (sessionId: string, files: ReadonlyArray<PreparedAttachment>) =>
        Effect.gen(function* () {
          if (files.length === 0) return []
          const dir = join(config.attachmentsDir, sessionId)
          yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie)
          const createdAt = yield* now
          return yield* Effect.forEach(files, (file) =>
            Effect.gen(function* () {
              const attachment: Attachment = {
                id: randomUUID(),
                name: file.name,
                kind: file.kind,
                mediaType: file.mediaType,
                size: file.bytes.length,
              }
              yield* fs.writeFile(join(dir, attachment.id), file.bytes).pipe(Effect.orDie)
              yield* repo.insertAttachment(sessionId, attachment, createdAt)
              return attachment
            }),
          )
        })

      /**
       * Gives a running agent the MCP servers and skills changed in the
       * settings since it started, before its next turn. A failure leaves the
       * agent as it was; the message still goes through.
       */
      const syncExtensions = (sessionId: string, state: ActiveRun) =>
        Effect.gen(function* () {
          const latest = yield* extensions.forAgent
          if (latest.version === state.extensionsVersion) return
          state.extensionsVersion = latest.version
          yield* state.run
            .applyExtensions(latest)
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  "Could not update the agent's MCP servers and skills",
                  sessionId,
                  error.message,
                ),
              ),
            )
        })

      /** Records the human's message with its files, then hands both to the agent. */
      const deliver = (session: Session, text: string, files: ReadonlyArray<PreparedAttachment>) =>
        Effect.gen(function* () {
          const moved = relocated.get(session.id)
          relocated.delete(session.id)
          // Only the agent sees this; the transcript shows the move as a notice.
          const forAgent =
            moved === undefined
              ? text
              : `[Humanity] This session now works in its own git worktree at ${moved.to} on branch ${session.branch}, no longer in ${moved.from}. Use paths under ${moved.to} from now on; files under ${moved.from} can no longer be changed.\n\n${text}`
          const stored = yield* storeAttachments(session.id, files)
          yield* addMessage(
            session.id,
            stored.length === 0
              ? { _tag: "user", text }
              : { _tag: "user", text, attachments: stored },
          )
          const state = yield* ensureRun(session)
          state.interrupted = false
          yield* syncExtensions(session.id, state)
          yield* setStatus(session.id, "running")
          yield* state.run.send({ text: forAgent, attachments: files.map(toAgentAttachment) })
        })

      const sendMessage = Effect.fn("SessionService.sendMessage")(function* (
        sessionId: string,
        text: string,
        uploads: ReadonlyArray<AttachmentUpload> = [],
      ) {
        const session = yield* get(sessionId)
        if (!acceptsMessages(session)) return yield* new SessionEnded({ sessionId })
        const files = yield* prepareAttachments(uploads)
        if (session.origin === "claude-code") {
          // From now on the conversation goes on here; the CLI's transcript no longer replaces it.
          yield* repo.update(sessionId, { detachImport: true, updatedAt: session.updatedAt })
          if (session.status === "ended") {
            yield* addMessage(sessionId, {
              _tag: "notice",
              level: "info",
              text: "Continued in Humanity. The messages above come from Claude Code.",
            })
          }
        }
        yield* deliver(session, text, files)
      })

      const attachment = Effect.fn("SessionService.attachment")(function* (
        sessionId: string,
        attachmentId: string,
      ) {
        yield* get(sessionId)
        const found = yield* repo.getAttachment(sessionId, attachmentId)
        const missing = new AttachmentNotFound({ attachmentId })
        if (Option.isNone(found)) return yield* missing
        const path = join(config.attachmentsDir, sessionId, found.value.id)
        if (!isInsideDir(config.attachmentsDir, path)) return yield* missing
        const bytes = yield* fs.readFile(path).pipe(Effect.mapError(() => missing))
        return {
          name: found.value.name,
          mediaType: found.value.mediaType,
          data: Buffer.from(bytes).toString("base64"),
        } satisfies AttachmentContent
      })

      /**
       * Switches the project's checkout to `name`, unless it is on it already.
       * A remote-tracking branch (`origin/x`) switches to the local `x`, which
       * git creates to track it when it does not exist yet.
       */
      const switchCheckout = (checkout: string, name: string) =>
        Effect.gen(function* () {
          const branches = yield* git.listBranches(checkout)
          const picked = branches.find((branch) => branch.name === name)
          const local = picked?.isRemote === true ? name.slice(name.indexOf("/") + 1) : name
          const current = branches.find((branch) => branch.isCurrent && !branch.isRemote)
          if (current?.name === local) return
          yield* git.checkout(checkout, local)
        })

      const create = Effect.fn("SessionService.create")(function* (options: {
        readonly projectId: string
        readonly title?: string | undefined
        readonly baseBranch?: string | undefined
        readonly prompt?: string | undefined
        readonly attachments?: ReadonlyArray<AttachmentUpload> | undefined
        readonly model?: string | undefined
        readonly effort?: ReasoningEffort | undefined
        readonly autonomy?: Autonomy | undefined
      }) {
        const project: Project = yield* projects.get(options.projectId)
        // Checked before anything changes, so a bad file leaves the checkout as it was.
        const files = yield* prepareAttachments(options.attachments ?? [])
        const prompt = options.prompt?.trim()
        if (files.length > 0 && !prompt) {
          return yield* new AttachmentRejected({
            name: "",
            reason: "Write a message to send the files with.",
          })
        }
        const id = SessionId.make(randomUUID())
        const title =
          options.title?.trim() ||
          options.prompt?.trim().split("\n")[0]?.slice(0, 80) ||
          "New session"
        const requested = options.baseBranch?.trim()
        if (requested) yield* switchCheckout(project.localPath, requested)
        const branch = (yield* git.status(project.localPath)).branch ?? "HEAD"

        const timestamp = yield* now
        const session: Session = {
          id,
          projectId: project.id,
          sdkSessionId: null,
          title,
          branch,
          worktreePath: project.localPath,
          inWorktree: false,
          model: options.model?.trim() || null,
          effort: options.effort ?? null,
          autonomy:
            options.autonomy ?? newThreadAutonomy(project, yield* preferences.pinnedDefaults),
          status: "idle",
          origin: "humanity",
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        yield* repo.insert(session)
        // The thread keeps this account for good: its transcript lives in that account's folder.
        const accountId = yield* accounts.activeId
        if (accountId !== DEFAULT_CLAUDE_ACCOUNT) yield* repo.setAccountId(id, accountId)
        yield* events.publishListChanged
        if (prompt) yield* deliver(session, prompt, files)
        return (yield* repo.get(id)).pipe(Option.getOrElse(() => session))
      })

      /**
       * The model of an `open_thread` call as the session stores it. Checked
       * against what Claude Code offers the account, when that is known, so a
       * name the agent made up comes back to it instead of failing the new thread.
       */
      const threadModel = (requested: string | undefined) =>
        Effect.gen(function* () {
          const wanted = requested?.trim().toLowerCase()
          if (!wanted || wanted === "default") return undefined
          const { models } = yield* accounts.status({ refresh: false })
          if (models.length === 0) return requested?.trim()
          const known = matchModel(models, wanted)
          if (known !== undefined) return known === "default" ? undefined : known
          return yield* new OpenThreadFailed({
            reason: `No thread was opened: "${requested}" is not a model this account offers. Pass one of these values as \`model\`: ${models
              .map((model) => `${model.value} (${model.displayName})`)
              .join(", ")}.`,
          })
        })

      /**
       * Humanity's `open_thread` tool for the agent of `parent`: a new thread
       * in the same project, started on the prompt. Its autonomy is the
       * default for new threads there, not that of the thread that opened it.
       */
      const openThread =
        (parent: Session) =>
        (request: OpenThreadRequest): Effect.Effect<OpenedThread, OpenThreadFailed> =>
          Effect.gen(function* () {
            const prompt = request.prompt.trim()
            if (prompt === "") {
              return yield* new OpenThreadFailed({
                reason: "No thread was opened: the prompt is empty.",
              })
            }
            const model = yield* threadModel(request.model)
            const opened = yield* create({
              projectId: parent.projectId,
              title: request.title,
              prompt,
              model,
              effort: request.effort,
            }).pipe(
              Effect.mapError(
                (error) =>
                  new OpenThreadFailed({
                    reason: `No thread was opened: ${error.message || error._tag}.`,
                  }),
              ),
            )
            return {
              sessionId: opened.id,
              projectId: opened.projectId,
              title: opened.title,
              model: opened.model,
              effort: opened.effort,
            }
          })

      const setupWorktree = Effect.fn("SessionService.setupWorktree")(function* (
        sessionId: string,
      ) {
        const session = yield* get(sessionId)
        if (session.status === "ended") return yield* new SessionEnded({ sessionId })
        if (session.inWorktree) return session
        // The agent's cwd cannot change under a running turn.
        if (session.status === "running" || session.status === "waiting_for_human") {
          return yield* new SessionBusy({ sessionId })
        }
        const project = yield* projects.get(session.projectId)
        const branch = sessionBranchName(session.id, session.title)
        const path = join(config.worktreesDir, project.id, session.id)
        const checkout = yield* git.status(project.localPath)
        yield* git.worktreeAdd(project.localPath, { path, branch, base: "HEAD" })

        // The agent process keeps its cwd; the next message starts one in the worktree.
        yield* stopRun(sessionId)
        // `updatedAt` is when the status last changed (the sidebar counts from it); keep it.
        yield* repo.update(sessionId, { worktree: { branch, path }, updatedAt: session.updatedAt })
        if (session.sdkSessionId !== null) {
          relocated.set(sessionId, { from: session.worktreePath, to: path })
        }
        const left =
          checkout.entries.length === 0
            ? ""
            : ` Uncommitted changes in ${project.localPath} stayed there.`
        yield* addMessage(sessionId, {
          _tag: "notice",
          level: "info",
          text: `Set up a worktree: the agent now works on ${branch}, started from ${checkout.branch ?? "HEAD"}.${left}`,
        })
        const updated = yield* get(sessionId)
        yield* events.publish(sessionId, { _tag: "SessionUpdated", session: updated })
        yield* events.publishListChanged
        return updated
      })

      const setAutonomy = Effect.fn("SessionService.setAutonomy")(function* (
        sessionId: string,
        autonomy: Autonomy,
      ) {
        const session = yield* get(sessionId)
        if (!acceptsMessages(session)) return yield* new SessionEnded({ sessionId })
        if (session.autonomy === autonomy) return session
        // `updatedAt` is when the status last changed (the sidebar counts from it); keep it.
        yield* repo.update(sessionId, { autonomy, updatedAt: session.updatedAt })
        const updated = yield* get(sessionId)
        yield* events.publish(sessionId, { _tag: "SessionUpdated", session: updated })
        yield* events.publishListChanged
        return updated
      })

      const setModel = Effect.fn("SessionService.setModel")(function* (
        sessionId: string,
        requested: string | null,
      ) {
        const session = yield* get(sessionId)
        if (!acceptsMessages(session)) return yield* new SessionEnded({ sessionId })
        const model = requested?.trim() || null
        if (session.model === model) return session
        // `updatedAt` is when the status last changed (the sidebar counts from it); keep it.
        yield* repo.update(sessionId, { model, updatedAt: session.updatedAt })
        // A session without an active run reads the stored model when its next run starts.
        const state = active.get(sessionId)
        if (state !== undefined) {
          yield* state.run.setModel(model ?? undefined).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("could not switch the model", {
                  sessionId,
                  reason: error.message,
                })
                // Between turns, closing the run makes the next message resume on the new model.
                if (session.status !== "running" && session.status !== "waiting_for_human") {
                  yield* stopRun(sessionId)
                  return
                }
                yield* addMessage(sessionId, {
                  _tag: "notice",
                  level: "warning",
                  text: `The agent could not switch models while working (${error.message}). It keeps the previous model until this session restarts.`,
                })
              }),
            ),
          )
        }
        const updated = yield* get(sessionId)
        yield* events.publish(sessionId, { _tag: "SessionUpdated", session: updated })
        yield* events.publishListChanged
        return updated
      })

      const setEffort = Effect.fn("SessionService.setEffort")(function* (
        sessionId: string,
        effort: ReasoningEffort | null,
      ) {
        const session = yield* get(sessionId)
        if (!acceptsMessages(session)) return yield* new SessionEnded({ sessionId })
        if (session.effort === effort) return session
        // `updatedAt` is when the status last changed (the sidebar counts from it); keep it.
        yield* repo.update(sessionId, { effort, updatedAt: session.updatedAt })
        // A session without an active run reads the stored effort when its next run starts.
        const state = active.get(sessionId)
        if (state !== undefined) {
          yield* state.run.setEffort(effort ?? undefined).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("could not switch the reasoning effort", {
                  sessionId,
                  reason: error.message,
                })
                // Between turns, closing the run makes the next message resume on the new effort.
                if (session.status !== "running" && session.status !== "waiting_for_human") {
                  yield* stopRun(sessionId)
                  return
                }
                yield* addMessage(sessionId, {
                  _tag: "notice",
                  level: "warning",
                  text: `The agent could not change its reasoning effort while working (${error.message}). It keeps the previous one until this session restarts.`,
                })
              }),
            ),
          )
        }
        const updated = yield* get(sessionId)
        yield* events.publish(sessionId, { _tag: "SessionUpdated", session: updated })
        yield* events.publishListChanged
        return updated
      })

      const interrupt = Effect.fn("SessionService.interrupt")(function* (sessionId: string) {
        yield* get(sessionId)
        const state = active.get(sessionId)
        if (state === undefined) return
        state.interrupted = true
        yield* setStatus(sessionId, "interrupted")
        yield* state.run.interrupt
        // The SDK aborts pending permission requests itself; this is the safety net.
        yield* approvals.expireSession(sessionId)
      })

      const end = Effect.fn("SessionService.end")(function* (
        sessionId: string,
        options: { readonly removeWorktree: boolean },
      ) {
        const session = yield* get(sessionId)
        yield* stopRun(sessionId)
        if (options.removeWorktree && isInsideDir(config.worktreesDir, session.worktreePath)) {
          const project = yield* projects.get(session.projectId).pipe(Effect.option)
          if (Option.isSome(project)) {
            yield* git.worktreeRemove(project.value.localPath, session.worktreePath)
          }
        }
        yield* setStatus(sessionId, "ended")
        return yield* get(sessionId)
      })

      const diff = (sessionId: string) =>
        Effect.flatMap(get(sessionId), (session) => git.diff(session.worktreePath))

      const commit = Effect.fn("SessionService.commit")(function* (
        sessionId: string,
        message: string,
      ) {
        const session = yield* get(sessionId)
        // A commit in the middle of a turn could capture half of the agent's work.
        if (session.status === "running" || session.status === "waiting_for_human") {
          return yield* new SessionBusy({ sessionId })
        }
        const status = yield* git.status(session.worktreePath)
        if (status.entries.length === 0) return yield* new NothingToCommit({ sessionId })
        const hash = yield* git.commit(session.worktreePath, message.trim())
        const subject = message.trim().split("\n")[0] ?? ""
        // A checkout can have switched branches since the session started.
        const branch = status.branch ?? session.branch
        yield* addMessage(sessionId, {
          _tag: "notice",
          level: "info",
          text: `Committed ${hash} to ${branch}: ${subject}`,
        })
        return hash
      })

      const stopProject = (projectId: string) =>
        Effect.gen(function* () {
          const sessions = yield* repo.listByProject(projectId)
          yield* Effect.forEach(sessions, (session) => stopRun(session.id), { discard: true })
        })

      const subscribe = (sessionId: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            // Subscribe before reading the snapshot, so nothing falls in between.
            const subscription = yield* events.subscribe(sessionId)
            const session = yield* get(sessionId)
            const snapshot: SessionEvent = {
              _tag: "Snapshot",
              session,
              messages: yield* repo.listMessages(sessionId),
              toolCalls: yield* repo.listToolCalls(sessionId),
              approvals: yield* approvals.listForSession(sessionId),
              usage: yield* repo.getUsage(sessionId),
            }
            return Stream.concat(Stream.make(snapshot), Stream.fromSubscription(subscription))
          }),
        )

      const watchAll: Stream.Stream<ReadonlyArray<Session>> = Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before the first read, so no change falls in between.
          const changes = yield* events.subscribeListChanged
          return Stream.concat(Stream.succeed(undefined), Stream.fromSubscription(changes)).pipe(
            Stream.mapEffect(() => repo.listAll),
          )
        }),
      )

      // Agent processes do not survive a daemon restart; say so instead of showing "running".
      const orphaned = yield* repo.listByStatus(["running", "waiting_for_human"])
      yield* Effect.forEach(
        orphaned,
        (session) =>
          Effect.gen(function* () {
            yield* repo.update(session.id, { status: "interrupted", updatedAt: yield* now })
            yield* repo.insertMessage(
              {
                id: randomUUID(),
                sessionId: session.id,
                content: {
                  _tag: "notice",
                  level: "warning",
                  text: "The Humanity daemon restarted while the agent was working. Send a message to resume.",
                },
                createdAt: yield* now,
              },
              undefined,
            )
          }),
        { discard: true },
      )

      return SessionService.of({
        list,
        get,
        create,
        setupWorktree,
        setAutonomy,
        setModel,
        setEffort,
        sendMessage,
        attachment,
        interrupt,
        refreshUsage: refreshUsageNow,
        end,
        stopProject,
        diff,
        commit,
        subscribe,
        watchAll,
      })
    }),
  )
}
