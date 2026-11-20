import {
  acceptsMessages,
  applyAutonomy,
  type AgentProvider,
  AUTO_TOOLS,
  type Attachment,
  type AttachmentContent,
  AttachmentNotFound,
  AttachmentRejected,
  type AttachmentUpload,
  type Autonomy,
  type FileEntry,
  BranchNotCheckedOut,
  ChangeId,
  DEFAULT_AUTONOMY,
  mentionedPaths,
  DEFAULT_ACCOUNT,
  DEFAULT_PROVIDER,
  type ChatMessage,
  ConfirmationId,
  type ContextUsage,
  type GitBranchExists,
  type GitInvalidBranchName,
  type GitRefNotFound,
  HUMANITY_MCP_SERVER,
  SKILL_TOOL,
  type MessageContent,
  type OpenedThread,
  type PendingConfirmation,
  type PlanUsage,
  PlanUsageUnavailable,
  type Project,
  ProjectId,
  type ProjectNotFound,
  type ProposedChange,
  PROVIDER_NAMES,
  ProviderSwitchUnavailable,
  QUESTION_TOOL,
  type ReasoningEffort,
  type Session,
  SessionBusy,
  SessionEnded,
  type SessionEvent,
  type TranscriptPage,
  SessionId,
  SessionNotFound,
  type SessionStatus,
  type SessionUsage,
  NothingToCommit,
  newThreadAutonomy,
  toolMode,
  trimCharacters,
  trimTrailing,
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
  type AgentExtensions,
  type AgentMcpServer,
  type AgentRun,
  AgentRunner,
  type PermissionDecision,
  type ToolPermissionRequest,
} from "../agent/AgentRunner.ts"
import { makeSkillTool } from "../extensions/skillTool.ts"
import { buildHandoff, historyEntries, latestPlan, readThreadHistory } from "../agent/handoff.ts"
import { HumanityMcp, OpenThreadFailed, type OpenThreadRequest } from "../mcp/HumanityMcp.ts"
import { makeTerminalTools } from "../terminal/agentTools.ts"
import { TerminalService } from "../terminal/TerminalService.ts"
import { normalizeSdkMessage } from "../agent/normalize.ts"
import { normalizeCodexEvent } from "../agent/normalizeCodex.ts"
import { normalizeAcpEvent } from "../agent/normalizeAcp.ts"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { Codex } from "../codex/Codex.ts"
import { outsideWorktreeDenial, planChange, reviewTarget } from "../agent/review.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { type PreparedAttachment, prepareAttachments, toAgentAttachment } from "./attachments.ts"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { ApprovalService } from "./ApprovalService.ts"
import { type GitError, GitService } from "./GitService.ts"
import type { LoggedCommit } from "./gitParsers.ts"
import { ClaudeAccountService } from "./ClaudeAccountService.ts"
import { CodexAccountService } from "./CodexAccountService.ts"
import { KiroAccountService } from "./KiroAccountService.ts"
import { AntigravityAccountService } from "./AntigravityAccountService.ts"
import { ExtensionsService } from "./ExtensionsService.ts"
import { FileSearchService } from "./FileSearchService.ts"
import { PreferencesService } from "./PreferencesService.ts"
import { ProjectService } from "./ProjectService.ts"
import { SessionEvents } from "./SessionEvents.ts"

interface ActiveRun {
  readonly run: AgentRun
  readonly scope: Scope.Closeable
  interrupted: boolean
  initSeen: boolean
  readonly denied: Set<string>
  readonly usageLock: Semaphore.Semaphore
  extensionsVersion: number
  readonly humanity: AgentMcpServer | undefined
  /** The run was sent the thread's pending handoff, which stays saved until the agent answers. */
  handoffSent: boolean
}

/**
 * The skill a call loads: Claude Code's own `Skill`, or Humanity's `load_skill` for a skill's
 * instructions (not for one of its other files).
 */
export const loadedSkill = (toolName: string, input: unknown): string | undefined => {
  const fields =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  if (toolName === "Skill") {
    return typeof fields["skill"] === "string" ? fields["skill"] : "unknown"
  }
  if (toolName !== SKILL_TOOL) return undefined
  const file = fields["file"]
  if (file !== undefined && file !== null && file !== "") return undefined
  return typeof fields["name"] === "string" ? fields["name"] : "unknown"
}

const withHumanity = (
  added: AgentExtensions,
  humanity: AgentMcpServer | undefined,
): AgentExtensions =>
  humanity === undefined
    ? added
    : {
        mcpServers: { ...added.mcpServers, [HUMANITY_MCP_SERVER]: humanity },
        plugins: added.plugins,
      }

export const slugify = (title: string): string => {
  const words = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
  return trimTrailing(trimCharacters(words, "-").slice(0, 40), "-") || "session"
}

export const sessionBranchName = (sessionId: string, title: string): string =>
  `humanity/${sessionId.slice(0, 8)}-${slugify(title)}`

const modelKey = (name: string): string => {
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
  return trimCharacters(words, "-").replace(/^claude-/, "")
}

interface OfferedModel {
  readonly value: string
  readonly displayName: string
}

export const matchModel = (
  models: ReadonlyArray<OfferedModel>,
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

export const COMMIT_LIST_LIMIT = 50

/** A thread's branch's commits as git lists them, before the forge adds what it knows. */
export interface LoggedBranchCommits {
  readonly branch: string
  readonly base: string | null
  readonly commits: ReadonlyArray<LoggedCommit>
  readonly more: boolean
}

export const threadBranch = (session: Session): string | null =>
  session.branch === "HEAD" ? null : session.branch

export class SessionService extends Context.Service<
  SessionService,
  {
    readonly list: (projectId: string) => Effect.Effect<ReadonlyArray<Session>, ProjectNotFound>
    readonly get: (sessionId: string) => Effect.Effect<Session, SessionNotFound>
    readonly create: (options: {
      readonly projectId: string
      readonly title?: string | undefined
      readonly baseBranch?: string | undefined
      readonly prompt?: string | undefined
      readonly attachments?: ReadonlyArray<AttachmentUpload> | undefined
      readonly mentions?: ReadonlyArray<string> | undefined
      readonly provider?: AgentProvider | undefined
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
    readonly setAutonomy: (
      sessionId: string,
      autonomy: Autonomy,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded>
    readonly setModel: (
      sessionId: string,
      model: string | null,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded>
    readonly setEffort: (
      sessionId: string,
      effort: ReasoningEffort | null,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded>
    /**
     * Moves the thread to another provider, between turns. The new agent picks up its own earlier
     * conversation in this thread when it has one, else gets this one as context with the human's
     * next message.
     */
    readonly switchProvider: (
      sessionId: string,
      provider: AgentProvider,
      model: string | null,
    ) => Effect.Effect<Session, SessionNotFound | SessionEnded | ProviderSwitchUnavailable>
    readonly sendMessage: (
      sessionId: string,
      text: string,
      attachments?: ReadonlyArray<AttachmentUpload>,
      mentions?: ReadonlyArray<string>,
    ) => Effect.Effect<void, SessionNotFound | SessionEnded | AttachmentRejected>
    readonly attachment: (
      sessionId: string,
      attachmentId: string,
    ) => Effect.Effect<AttachmentContent, SessionNotFound | AttachmentNotFound>
    readonly interrupt: (sessionId: string) => Effect.Effect<void, SessionNotFound>
    readonly refreshUsage: (
      sessionId: string,
    ) => Effect.Effect<SessionUsage, SessionNotFound | PlanUsageUnavailable>
    readonly end: (
      sessionId: string,
      options: { readonly removeWorktree: boolean },
    ) => Effect.Effect<Session, SessionNotFound | GitError>
    readonly searchFiles: (
      sessionId: string,
      query: string,
      recent?: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<FileEntry>, SessionNotFound | GitError>
    readonly stopProject: (projectId: string) => Effect.Effect<void>
    readonly diff: (sessionId: string) => Effect.Effect<WorkingTreeDiff, SessionNotFound | GitError>
    readonly commits: (
      sessionId: string,
    ) => Effect.Effect<
      LoggedBranchCommits,
      SessionNotFound | ProjectNotFound | GitError | GitRefNotFound
    >
    readonly commit: (
      sessionId: string,
      message: string,
      paths?: ReadonlyArray<string>,
    ) => Effect.Effect<
      string,
      SessionNotFound | SessionBusy | NothingToCommit | BranchNotCheckedOut | GitError
    >
    /**
     * Shows `notice` in the thread and, when the agent has a conversation to resume, puts `agent`
     * in front of the human's next message so the agent hears about it before it acts.
     */
    readonly tell: (
      sessionId: string,
      message: { readonly notice: string; readonly agent?: string | undefined },
    ) => Effect.Effect<void, SessionNotFound>
    readonly subscribe: (sessionId: string) => Stream.Stream<SessionEvent, SessionNotFound>
    readonly earlierMessages: (
      sessionId: string,
      before: string,
    ) => Effect.Effect<TranscriptPage, SessionNotFound>
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
      const terminals = yield* TerminalService
      const fileSearch = yield* FileSearchService
      const config = yield* ServerConfig
      const fs = yield* FileSystem.FileSystem
      const preferences = yield* PreferencesService
      const accounts = yield* ClaudeAccountService
      const codexAccounts = yield* CodexAccountService
      const kiroAccounts = yield* KiroAccountService
      const antigravityAccounts = yield* AntigravityAccountService
      const extensions = yield* ExtensionsService
      const mcp = yield* HumanityMcp
      const claude = yield* ClaudeCode
      const codex = yield* Codex
      const approvals = yield* ApprovalService
      const serviceScope = yield* Effect.scope

      const active = new Map<string, ActiveRun>()

      const accountsOf = (provider: AgentProvider) => {
        switch (provider) {
          case "codex":
            return codexAccounts
          case "kiro":
            return kiroAccounts
          case "antigravity":
            return antigravityAccounts
          default:
            return accounts
        }
      }
      const accountDir = (session: Session) =>
        Effect.flatMap(repo.getAccountId(session.id), (accountId) =>
          accountsOf(session.provider).configDirFor(accountId),
        )
      const relocated = new Map<string, { readonly from: string; readonly to: string }>()
      /** The whole conversation, for an agent that was to resume its own and could not. */
      const resumeFallback = new Map<string, string>()
      const agentNotes = new Map<string, Array<string>>()
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

      const followBranch = (sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* get(sessionId)
          const current = yield* git.currentBranch(session.worktreePath)
          if (current === undefined || current === session.branch) return
          yield* repo.update(sessionId, { branch: current, updatedAt: session.updatedAt })
          yield* events.publish(sessionId, {
            _tag: "SessionUpdated",
            session: yield* get(sessionId),
          })
          yield* events.publishListChanged
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("could not read the session's branch", {
              sessionId,
              error: String(error),
            }),
          ),
        )

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

      const threadEntries = (sessionId: string, current: AgentProvider) =>
        Effect.gen(function* () {
          const messages = yield* repo.listMessages(sessionId)
          const toolCalls = yield* repo.listToolCalls(sessionId)
          return { entries: historyEntries(messages, toolCalls, current), toolCalls }
        })

      const whileWaiting = <A>(sessionId: string, waitForHuman: Effect.Effect<A>) =>
        Effect.gen(function* () {
          yield* setStatus(sessionId, "waiting_for_human")
          return yield* waitForHuman
        }).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              const pending = yield* approvals.pendingCount(sessionId)
              const session = yield* repo.get(sessionId)
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

      const currentAutonomy = (sessionId: string) =>
        Effect.map(repo.get(sessionId), (found) =>
          Option.match(found, {
            onNone: () => DEFAULT_AUTONOMY,
            onSome: (session) => session.autonomy,
          }),
        )

      const decide =
        (session: Session, state: { readonly denied: Set<string> }) =>
        (request: ToolPermissionRequest): Effect.Effect<PermissionDecision> =>
          Effect.gen(function* () {
            const decision: PermissionDecision = yield* Effect.gen(function* () {
              const tool = toolMode(request.toolName)
              const autonomy = yield* currentAutonomy(session.id)
              const mode =
                request.toolName === QUESTION_TOOL
                  ? tool
                  : approvals.allowsInSession(session.id, request.toolName)
                    ? "auto"
                    : applyAutonomy(autonomy, tool)
              switch (mode) {
                case "auto": {
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
            const skill = loadedSkill(block.toolName, block.input)
            if (skill !== undefined) {
              yield* events.publish(session.id, {
                _tag: "SkillLoaded",
                toolUseId: block.toolUseId,
                skill,
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

      const refreshUsage = (sessionId: string, state: ActiveRun, withPlan: boolean) =>
        state.usageLock.withPermits(1)(
          Effect.gen(function* () {
            const context = yield* state.run.contextUsage
            const plan = withPlan ? yield* state.run.planUsage : undefined
            return { plan, usage: yield* storeUsage(sessionId, context, plan) }
          }),
        )

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

      const refreshUsageNow = Effect.fn("SessionService.refreshUsage")(function* (
        sessionId: string,
      ) {
        const session = yield* get(sessionId)
        const unavailable = (reason: string) => new PlanUsageUnavailable({ reason })
        const state = active.get(sessionId)
        if (state !== undefined) {
          const { plan, usage } = yield* refreshUsage(sessionId, state, true)
          if (plan === undefined) {
            return yield* unavailable("the agent did not report the plan's limits.")
          }
          return usage
        }
        if (session.provider === "kiro" || session.provider === "antigravity") {
          return yield* unavailable(
            `${PROVIDER_NAMES[session.provider]} does not report plan limits here.`,
          )
        }
        const plan =
          session.provider === "codex"
            ? yield* codex
                .planUsage(yield* accountDir(session))
                .pipe(Effect.mapError((error) => unavailable(error.reason)))
            : yield* claude
                .planUsage(yield* accountDir(session))
                .pipe(Effect.mapError((error) => unavailable(error.reason)))
        if (plan === undefined) {
          return yield* unavailable("this login has no plan limits to report.")
        }
        return yield* storeUsage(sessionId, undefined, plan)
      })

      const handleRaw = (session: Session, state: ActiveRun) => (raw: unknown) =>
        Effect.gen(function* () {
          const normalized =
            session.provider === "codex"
              ? normalizeCodexEvent(raw)
              : session.provider === "kiro" || session.provider === "antigravity"
                ? normalizeAcpEvent(raw)
                : normalizeSdkMessage(raw)
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
            if (state.initSeen) return
            state.initSeen = true
          }
          if (content._tag === "other" && content.type === "user") return

          const answered =
            (content._tag === "assistant" && content.parentToolUseId === null) ||
            (content._tag === "result" && !content.isError)
          if (state.handoffSent && answered) {
            state.handoffSent = false
            resumeFallback.delete(session.id)
            yield* repo.setPendingHandoff(session.id, null)
          }

          yield* addMessage(session.id, content, raw)
          yield* startToolCalls(session, content)
          yield* finishToolCalls(session, state, content, normalized.structuredResult)

          const turnEnded = content._tag === "result"
          if (turnEnded || (content._tag === "assistant" && content.parentToolUseId === null)) {
            yield* refreshUsage(session.id, state, turnEnded).pipe(Effect.forkIn(state.scope))
          }

          if (content._tag === "result") {
            yield* followBranch(session.id)
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

      const stopRun = (sessionId: string) =>
        Effect.gen(function* () {
          const state = active.get(sessionId)
          if (state === undefined) return
          active.delete(sessionId)
          yield* Scope.close(state.scope, Exit.void)
          yield* approvals.expireSession(sessionId)
        })

      const ensureRun = (session: Session) =>
        startLock.withPermits(1)(
          Effect.gen(function* () {
            const existing = active.get(session.id)
            if (existing !== undefined) return existing

            const added = yield* extensions.forAgent
            const scope = yield* Scope.fork(serviceScope)
            const denied = new Set<string>()
            const offered = yield* preferences.tools
            const configDir = yield* accountDir(session)
            const skillCatalog = offered.skills
              ? yield* extensions.skillsForThread({
                  provider: session.provider,
                  onDefaultLogin: configDir === undefined,
                  cwd: session.worktreePath,
                })
              : []
            const history = (yield* repo.hasProviderSwitch(session.id))
              ? (args: unknown) =>
                  Effect.map(threadEntries(session.id, session.provider), ({ entries }) =>
                    readThreadHistory(entries, args),
                  )
              : undefined
            const humanity =
              offered.openThread ||
              offered.terminals ||
              skillCatalog.length > 0 ||
              history !== undefined
                ? yield* mcp
                    .serve({
                      ...(offered.openThread ? { openThread: openThread(session) } : {}),
                      ...(skillCatalog.length > 0
                        ? {
                            skills: {
                              catalog: skillCatalog,
                              load: makeSkillTool(fs, skillCatalog),
                            },
                          }
                        : {}),
                      ...(history === undefined ? {} : { history }),
                      ...(offered.terminals
                        ? {
                            terminal: makeTerminalTools({
                              sessionId: session.id,
                              terminals,
                              decide: decide(session, { denied }),
                            }),
                          }
                        : {}),
                    })
                    .pipe(Scope.provide(scope))
                : undefined
            const state: ActiveRun = {
              run: undefined as unknown as AgentRun,
              scope,
              interrupted: false,
              initSeen: false,
              denied,
              usageLock: yield* Semaphore.make(1),
              extensionsVersion: added.version,
              humanity,
              handoffSent: false,
            }
            const run = yield* runner
              .start({
                provider: session.provider,
                cwd: session.worktreePath,
                configDir,
                resume: session.sdkSessionId ?? undefined,
                model: session.model ?? undefined,
                effort: session.effort ?? undefined,
                extensions: withHumanity(added, humanity),
                allowedTools: AUTO_TOOLS,
                offersOpenThread: offered.openThread,
                canUseTool: decide(session, state),
              })
              .pipe(Scope.provide(scope))
            const ready: ActiveRun = Object.assign(state, { run })
            active.set(session.id, ready)

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
                    const fallback = resumeFallback.get(session.id)
                    if (fallback !== undefined && !state.initSeen) {
                      resumeFallback.delete(session.id)
                      yield* repo.update(session.id, { sdkSessionId: null, updatedAt: yield* now })
                      yield* repo.setPendingHandoff(session.id, fallback)
                      yield* addMessage(session.id, {
                        _tag: "notice",
                        level: "warning",
                        text: `${PROVIDER_NAMES[session.provider]} could not pick up its earlier conversation in this thread. It gets the whole conversation as context instead: send your message again.`,
                      })
                    }
                    yield* setStatus(session.id, "error", reason)
                  }),
              }),
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

      const syncExtensions = (sessionId: string, state: ActiveRun) =>
        Effect.gen(function* () {
          const latest = yield* extensions.forAgent
          if (latest.version === state.extensionsVersion) return
          state.extensionsVersion = latest.version
          yield* state.run
            .applyExtensions(withHumanity(latest, state.humanity))
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

      const checkReadable = (provider: AgentProvider, files: ReadonlyArray<PreparedAttachment>) =>
        Effect.gen(function* () {
          if (provider !== "codex") return
          const pdf = files.find((file) => file.kind === "pdf")
          if (pdf !== undefined) {
            return yield* new AttachmentRejected({
              name: pdf.name,
              reason: "Codex cannot read PDF files. Send it as text or an image instead.",
            })
          }
        })

      const deliver = (
        session: Session,
        text: string,
        files: ReadonlyArray<PreparedAttachment>,
        mentions: ReadonlyArray<string>,
      ) =>
        Effect.gen(function* () {
          const moved = relocated.get(session.id)
          relocated.delete(session.id)
          const notes = agentNotes.get(session.id) ?? []
          agentNotes.delete(session.id)
          const handoff = yield* repo.getPendingHandoff(session.id)
          const forAgent = [
            ...(handoff === null ? [] : [handoff]),
            ...(moved === undefined
              ? []
              : [
                  `[Humanity] This session now works in its own git worktree at ${moved.to} on branch ${session.branch}, no longer in ${moved.from}. Use paths under ${moved.to} from now on; files under ${moved.from} can no longer be changed.`,
                ]),
            ...notes,
            text,
          ].join("\n\n")
          const stored = yield* storeAttachments(session.id, files)
          const mentioned = mentionedPaths(text, mentions)
          yield* addMessage(session.id, {
            _tag: "user",
            text,
            ...(stored.length === 0 ? {} : { attachments: stored }),
            ...(mentioned.length === 0 ? {} : { mentions: mentioned }),
          })
          const state = yield* ensureRun(session)
          state.interrupted = false
          if (handoff !== null) state.handoffSent = true
          yield* syncExtensions(session.id, state)
          yield* setStatus(session.id, "running")
          yield* state.run.send({
            text: forAgent,
            attachments: files.map(toAgentAttachment),
            ...(mentioned.length === 0 ? {} : { mentions: mentioned }),
          })
        })

      const sendMessage = Effect.fn("SessionService.sendMessage")(function* (
        sessionId: string,
        text: string,
        uploads: ReadonlyArray<AttachmentUpload> = [],
        mentions: ReadonlyArray<string> = [],
      ) {
        const session = yield* get(sessionId)
        if (!acceptsMessages(session)) return yield* new SessionEnded({ sessionId })
        const files = yield* prepareAttachments(uploads)
        yield* checkReadable(session.provider, files)
        if (session.origin === "claude-code") {
          yield* repo.update(sessionId, { detachImport: true, updatedAt: session.updatedAt })
          if (session.status === "ended") {
            yield* addMessage(sessionId, {
              _tag: "notice",
              level: "info",
              text: "Continued in Humanity. The messages above come from Claude Code.",
            })
          }
        }
        yield* deliver(session, text, files, mentions)
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
        readonly mentions?: ReadonlyArray<string> | undefined
        readonly provider?: AgentProvider | undefined
        readonly model?: string | undefined
        readonly effort?: ReasoningEffort | undefined
        readonly autonomy?: Autonomy | undefined
      }) {
        const project: Project = yield* projects.get(options.projectId)
        const files = yield* prepareAttachments(options.attachments ?? [])
        const provider = options.provider ?? DEFAULT_PROVIDER
        yield* checkReadable(provider, files)
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
          provider,
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
        const accountId = yield* accountsOf(provider).activeId
        if (accountId !== DEFAULT_ACCOUNT) yield* repo.setAccountId(id, accountId)
        yield* events.publishListChanged
        if (prompt) yield* deliver(session, prompt, files, options.mentions ?? [])
        return (yield* repo.get(id)).pipe(Option.getOrElse(() => session))
      })

      const threadModel = (provider: AgentProvider, requested: string | undefined | null) =>
        Effect.gen(function* () {
          const product = PROVIDER_NAMES[provider]
          const { connection, models } = yield* accountsOf(provider).status({ refresh: false })
          if (connection._tag === "SignedOut") {
            return yield* new OpenThreadFailed({
              reason: `No thread was opened: nobody is signed in to ${product} in Humanity. The human can sign in under Settings, or you can open the thread on another provider.`,
            })
          }
          const wanted = requested?.trim().toLowerCase()
          if (!wanted || wanted === "default") return undefined
          if (models.length === 0) return requested?.trim()
          const known = matchModel(models, wanted)
          if (known !== undefined) return known === "default" ? undefined : known
          return yield* new OpenThreadFailed({
            reason: `No thread was opened: "${requested}" is not a model ${product} offers this account. Pass one of these values as \`model\`: ${models
              .map((model) => `${model.value} (${model.displayName})`)
              .join(", ")}.`,
          })
        })

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
            const provider = request.provider ?? parent.provider
            const model = yield* threadModel(provider, request.model)
            const opened = yield* create({
              projectId: parent.projectId,
              provider,
              title: request.title ?? undefined,
              prompt,
              model,
              effort: request.effort ?? undefined,
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
              provider: opened.provider,
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
        if (session.status === "running" || session.status === "waiting_for_human") {
          return yield* new SessionBusy({ sessionId })
        }
        const project = yield* projects.get(session.projectId)
        const branch = sessionBranchName(session.id, session.title)
        const path = join(config.worktreesDir, project.id, session.id)
        const checkout = yield* git.status(project.localPath)
        const own = threadBranch(session)
        const base = own === null || own === checkout.branch ? "HEAD" : own
        yield* git.worktreeAdd(project.localPath, { path, branch, base })

        yield* stopRun(sessionId)
        yield* repo.update(sessionId, { worktree: { branch, path }, updatedAt: session.updatedAt })
        yield* terminals.moveSession(session.id, path)
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
          text: `Set up a worktree: the agent now works on ${branch}, started from ${base === "HEAD" ? (checkout.branch ?? "HEAD") : base}.${left}`,
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
        yield* repo.update(sessionId, { model, updatedAt: session.updatedAt })
        const state = active.get(sessionId)
        if (state !== undefined) {
          yield* state.run.setModel(model ?? undefined).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("could not switch the model", {
                  sessionId,
                  reason: error.message,
                })
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
        yield* repo.update(sessionId, { effort, updatedAt: session.updatedAt })
        const state = active.get(sessionId)
        if (state !== undefined) {
          yield* state.run.setEffort(effort ?? undefined).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("could not switch the reasoning effort", {
                  sessionId,
                  reason: error.message,
                })
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

      const switchTarget = (provider: AgentProvider, requested: string | null) =>
        Effect.gen(function* () {
          const product = PROVIDER_NAMES[provider]
          const refused = (reason: string) => new ProviderSwitchUnavailable({ reason })
          const { connection, models } = yield* accountsOf(provider).status({ refresh: false })
          if (connection._tag === "SignedOut") {
            return yield* refused(
              `Nobody is signed in to ${product} in Humanity. Sign in under Settings, then switch again.`,
            )
          }
          const wanted = requested?.trim()
          if (!wanted || wanted.toLowerCase() === "default") return null
          if (models.length === 0) return wanted
          const known = matchModel(models, wanted)
          if (known === undefined) {
            return yield* refused(`${product} does not offer "${wanted}" to this account.`)
          }
          return known === "default" ? null : known
        })

      const switchProvider = Effect.fn("SessionService.switchProvider")(function* (
        sessionId: string,
        provider: AgentProvider,
        requested: string | null,
      ) {
        const session = yield* get(sessionId)
        if (!acceptsMessages(session)) return yield* new SessionEnded({ sessionId })
        if (provider === session.provider) return yield* setModel(sessionId, requested)
        if (session.status === "running" || session.status === "waiting_for_human") {
          return yield* new ProviderSwitchUnavailable({
            reason: `The agent is still working. Wait until it is idle, or stop it, before moving the thread to ${PROVIDER_NAMES[provider]}.`,
          })
        }
        const model = yield* switchTarget(provider, requested)
        const activeAccount = yield* accountsOf(provider).activeId
        const accountId = activeAccount === DEFAULT_ACCOUNT ? null : activeAccount

        yield* stopRun(sessionId)
        const timestamp = yield* now
        const { entries, toolCalls } = yield* threadEntries(sessionId, session.provider)
        const fromAccount = yield* repo.getAccountId(sessionId)
        // An agent that never got its handoff has not seen the thread so far: it is not kept to
        // resume, and gets the whole conversation if the thread comes back to it.
        const unheard = (yield* repo.getPendingHandoff(sessionId)) !== null
        if (session.sdkSessionId !== null && !unheard) {
          yield* repo.parkProvider({
            sessionId,
            provider: session.provider,
            accountId: fromAccount,
            sdkSessionId: session.sdkSessionId,
            cwd: session.worktreePath,
            seenEntries: entries.length,
            parkedAt: timestamp,
          })
        }
        const parked = Option.filter(
          yield* repo.findParked(sessionId, provider, accountId),
          (earlier) => earlier.cwd === session.worktreePath,
        )
        const plan = latestPlan(toolCalls)
        const whole = buildHandoff({
          entries,
          since: 1,
          from: session.provider,
          to: provider,
          resumed: false,
          plan,
        })
        const handoff = Option.match(parked, {
          onNone: () => whole,
          onSome: (earlier) =>
            buildHandoff({
              entries,
              since: earlier.seenEntries + 1,
              from: session.provider,
              to: provider,
              resumed: true,
            }),
        })

        yield* repo.setPendingHandoff(sessionId, handoff?.text ?? null)
        yield* repo.update(sessionId, {
          provider,
          model,
          sdkSessionId: Option.match(parked, {
            onNone: () => null,
            onSome: (earlier) => earlier.sdkSessionId,
          }),
          ...(session.origin === "claude-code" ? { detachImport: true as const } : {}),
          updatedAt: timestamp,
        })
        yield* repo.setAccountId(sessionId, accountId)
        if (Option.isSome(parked)) {
          yield* repo.dropParked(sessionId, provider, accountId)
          if (whole !== undefined) resumeFallback.set(sessionId, whole.text)
        } else {
          resumeFallback.delete(sessionId)
        }
        relocated.delete(sessionId)
        yield* approvals.forgetAllowed(sessionId)
        yield* addMessage(sessionId, {
          _tag: "provider_switch",
          from: session.provider,
          to: provider,
          model,
          resumed: Option.isSome(parked),
          included: handoff?.included ?? 0,
          omitted: handoff?.omitted ?? 0,
        })
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
        yield* approvals.expireSession(sessionId)
      })

      const end = Effect.fn("SessionService.end")(function* (
        sessionId: string,
        options: { readonly removeWorktree: boolean },
      ) {
        const session = yield* get(sessionId)
        yield* stopRun(sessionId)
        yield* terminals.closeOwner({ _tag: "Session", sessionId: session.id })
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

      const searchFiles = (sessionId: string, query: string, recent?: ReadonlyArray<string>) =>
        Effect.flatMap(get(sessionId), (session) =>
          fileSearch.search(session.worktreePath, query, recent),
        )

      const commits = Effect.fn("SessionService.commits")(function* (sessionId: string) {
        const session = yield* get(sessionId)
        const project = yield* projects.get(session.projectId)
        const cwd = session.worktreePath
        const own = threadBranch(session)
        let base: string | undefined
        if (own !== project.defaultBranch) {
          for (const candidate of [`origin/${project.defaultBranch}`, project.defaultBranch]) {
            if (yield* git.hasCommit(cwd, candidate)) {
              base = candidate
              break
            }
          }
        }
        const ref = own === null ? "HEAD" : `refs/heads/${own}`
        const listed = yield* git.log(cwd, ref, { exclude: base, limit: COMMIT_LIST_LIMIT })
        return {
          branch: own ?? "HEAD",
          base: base ?? null,
          ...listed,
        } satisfies LoggedBranchCommits
      })

      const commit = Effect.fn("SessionService.commit")(function* (
        sessionId: string,
        message: string,
        paths?: ReadonlyArray<string>,
      ) {
        const session = yield* get(sessionId)
        if (session.status === "running" || session.status === "waiting_for_human") {
          return yield* new SessionBusy({ sessionId })
        }
        const status = yield* git.status(session.worktreePath)
        const own = threadBranch(session)
        if (own !== null && status.branch !== own) {
          return yield* new BranchNotCheckedOut({ branch: own, checkedOut: status.branch })
        }
        if (status.entries.length === 0) return yield* new NothingToCommit({ sessionId })
        const hash = yield* git.commit(session.worktreePath, message.trim(), paths)
        const subject = message.trim().split("\n")[0] ?? ""
        const branch = status.branch ?? session.branch
        yield* addMessage(sessionId, {
          _tag: "notice",
          level: "info",
          text: `Committed ${hash} to ${branch}: ${subject}`,
        })
        return hash
      })

      const tell = Effect.fn("SessionService.tell")(function* (
        sessionId: string,
        message: { readonly notice: string; readonly agent?: string | undefined },
      ) {
        const session = yield* get(sessionId)
        yield* addMessage(sessionId, { _tag: "notice", level: "info", text: message.notice })
        if (message.agent === undefined || session.sdkSessionId === null) return
        const notes = agentNotes.get(sessionId) ?? []
        notes.push(message.agent)
        agentNotes.set(sessionId, notes)
      })

      const stopProject = (projectId: string) =>
        Effect.gen(function* () {
          const sessions = yield* repo.listByProject(projectId)
          yield* Effect.forEach(
            sessions,
            (session) =>
              Effect.andThen(
                stopRun(session.id),
                terminals.closeOwner({ _tag: "Session", sessionId: session.id }),
              ),
            { discard: true },
          )
          yield* terminals.closeOwner({ _tag: "Project", projectId: ProjectId.make(projectId) })
        })

      const subscribe = (sessionId: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const subscription = yield* events.subscribe(sessionId)
            const session = yield* get(sessionId)
            const page = yield* repo.transcriptPage(sessionId)
            const snapshot: SessionEvent = {
              _tag: "Snapshot",
              session,
              ...page,
              approvals: yield* approvals.listForSession(sessionId),
              usage: yield* repo.getUsage(sessionId),
            }
            return Stream.concat(Stream.make(snapshot), Stream.fromSubscription(subscription))
          }),
        )

      const earlierMessages = (sessionId: string, before: string) =>
        Effect.andThen(get(sessionId), repo.transcriptPage(sessionId, before))

      const watchAll: Stream.Stream<ReadonlyArray<Session>> = Stream.unwrap(
        Effect.gen(function* () {
          const changes = yield* events.subscribeListChanged
          return Stream.concat(Stream.succeed(undefined), Stream.fromSubscription(changes)).pipe(
            Stream.mapEffect(() => repo.listAll),
          )
        }),
      )

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
        switchProvider,
        sendMessage,
        attachment,
        interrupt,
        refreshUsage: refreshUsageNow,
        end,
        stopProject,
        diff,
        searchFiles,
        commits,
        commit,
        tell,
        subscribe,
        earlierMessages,
        watchAll,
      })
    }),
  )
}
