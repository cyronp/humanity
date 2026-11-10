import {
  type ChatMessage,
  type GitBranchExists,
  type GitInvalidBranchName,
  type GitRefNotFound,
  type MessageContent,
  type Project,
  type ProjectNotFound,
  resolveToolMode,
  type Session,
  SessionEnded,
  type SessionEvent,
  SessionId,
  SessionNotFound,
  type SessionStatus,
  type ToolCall,
} from "@humanity/contracts"
import { Context, DateTime, Effect, Exit, Layer, Option, Scope, Semaphore, Stream } from "effect"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import {
  type AgentRun,
  AgentRunner,
  type PermissionDecision,
  type ToolPermissionRequest,
} from "../agent/AgentRunner.ts"
import { normalizeSdkMessage } from "../agent/normalize.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type GitError, GitService } from "./GitService.ts"
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
}

/** `Fix the login bug!` → `fix-the-login-bug` */
export const slugify = (title: string): string =>
  title
    .normalize("NFKD")
    // Drop the accents NFKD split off: `Ü` becomes `U`, not `u-`.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "session"

/** `humanity/<short-id>-<slug>` */
export const sessionBranchName = (sessionId: string, title: string): string =>
  `humanity/${sessionId.slice(0, 8)}-${slugify(title)}`

const deniedMessage = (toolName: string) =>
  `Humanity denied ${toolName}: in this version only read-only tools run, and changes need human review, which is not enabled yet. Use Read, Glob and Grep, and describe the change you would make instead.`

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
    }) => Effect.Effect<
      Session,
      ProjectNotFound | GitError | GitBranchExists | GitInvalidBranchName | GitRefNotFound
    >
    readonly sendMessage: (
      sessionId: string,
      text: string,
    ) => Effect.Effect<void, SessionNotFound | SessionEnded>
    readonly interrupt: (sessionId: string) => Effect.Effect<void, SessionNotFound>
    readonly end: (
      sessionId: string,
      options: { readonly removeWorktree: boolean },
    ) => Effect.Effect<Session, SessionNotFound | GitError>
    /** Stops every running agent of a project, before the project is removed. */
    readonly stopProject: (projectId: string) => Effect.Effect<void>
    readonly subscribe: (sessionId: string) => Stream.Stream<SessionEvent, SessionNotFound>
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
      const serviceScope = yield* Effect.scope

      const active = new Map<string, ActiveRun>()
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

      /** M3: only `auto` tools run. Everything else is denied with an explanation. */
      const decide =
        (session: Session, state: { readonly denied: Set<string> }) =>
        (request: ToolPermissionRequest): Effect.Effect<PermissionDecision> =>
          Effect.gen(function* () {
            const project = yield* projects.get(session.projectId).pipe(Effect.option)
            const mode = Option.match(project, {
              onNone: () => "deny" as const,
              onSome: (value) => resolveToolMode(value.policy, request.toolName),
            })
            if (mode === "auto") return { behavior: "allow" } as const
            state.denied.add(request.toolUseId)
            return { behavior: "deny", message: deniedMessage(request.toolName) } as const
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
        })

      const ensureRun = (session: Session) =>
        startLock.withPermits(1)(
          Effect.gen(function* () {
            const existing = active.get(session.id)
            if (existing !== undefined) return existing

            const project = yield* projects.get(session.projectId).pipe(Effect.orDie)
            const scope = yield* Scope.fork(serviceScope)
            const state: ActiveRun = {
              run: undefined as unknown as AgentRun,
              scope,
              interrupted: false,
              initSeen: false,
              denied: new Set(),
            }
            const run = yield* runner
              .start({
                cwd: session.worktreePath,
                resume: session.sdkSessionId ?? undefined,
                allowedTools: project.policy.rules
                  .filter((rule) => rule.mode === "auto" && !rule.pattern.endsWith("*"))
                  .map((rule) => rule.pattern),
                toolMode: (toolName) => resolveToolMode(project.policy, toolName),
                canUseTool: decide(session, state),
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

      const sendMessage = Effect.fn("SessionService.sendMessage")(function* (
        sessionId: string,
        text: string,
      ) {
        const session = yield* get(sessionId)
        if (session.status === "ended") return yield* new SessionEnded({ sessionId })
        yield* addMessage(sessionId, { _tag: "user", text })
        const state = yield* ensureRun(session)
        state.interrupted = false
        yield* setStatus(sessionId, "running")
        yield* state.run.send(text)
      })

      const create = Effect.fn("SessionService.create")(function* (options: {
        readonly projectId: string
        readonly title?: string | undefined
        readonly baseBranch?: string | undefined
        readonly prompt?: string | undefined
      }) {
        const project: Project = yield* projects.get(options.projectId)
        const id = SessionId.make(randomUUID())
        const title =
          options.title?.trim() ||
          options.prompt?.trim().split("\n")[0]?.slice(0, 80) ||
          "New session"
        const branch = sessionBranchName(id, title)
        const worktreePath = join(config.worktreesDir, project.id, id)
        const base = options.baseBranch?.trim() || project.defaultBranch

        yield* git.worktreeAdd(project.localPath, { path: worktreePath, branch, base })

        const timestamp = yield* now
        const session: Session = {
          id,
          projectId: project.id,
          sdkSessionId: null,
          title,
          branch,
          worktreePath,
          status: "idle",
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        yield* repo.insert(session)
        const prompt = options.prompt?.trim()
        if (prompt) yield* sendMessage(id, prompt).pipe(Effect.orDie)
        return (yield* repo.get(id)).pipe(Option.getOrElse(() => session))
      })

      const interrupt = Effect.fn("SessionService.interrupt")(function* (sessionId: string) {
        yield* get(sessionId)
        const state = active.get(sessionId)
        if (state === undefined) return
        state.interrupted = true
        yield* setStatus(sessionId, "interrupted")
        yield* state.run.interrupt
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
            }
            return Stream.concat(Stream.make(snapshot), Stream.fromSubscription(subscription))
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
        sendMessage,
        interrupt,
        end,
        stopProject,
        subscribe,
      })
    }),
  )
}
