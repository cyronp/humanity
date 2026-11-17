import {
  DEFAULT_AUTONOMY,
  type Project,
  type ProjectNotFound,
  type Session,
  type SessionEvent,
  SessionId,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option, Schedule, Semaphore } from "effect"
import { randomUUID } from "node:crypto"
import { ClaudeHistory, type ClaudeConversation } from "../claude/ClaudeHistory.ts"
import { importTranscript } from "../claude/transcript.ts"
import { type ImportIndex, SessionRepo } from "../db/SessionRepo.ts"
import { ApprovalService } from "./ApprovalService.ts"
import { PreferencesService } from "./PreferencesService.ts"
import { ProjectService } from "./ProjectService.ts"
import { SessionEvents } from "./SessionEvents.ts"

const SYNC_INTERVAL = "5 minutes"
const FIRST_SYNC_DELAY = "5 seconds"

const MAX_TITLE = 80

const iso = (ms: number) => new Date(ms).toISOString()

export class HistoryImport extends Context.Service<
  HistoryImport,
  {
    readonly syncProject: (projectId: string) => Effect.Effect<number, ProjectNotFound>
    readonly syncAll: Effect.Effect<void>
    readonly syncInBackground: (projectId: string) => Effect.Effect<void>
    readonly syncAllInBackground: Effect.Effect<void>
  }
>()("humanity/HistoryImport") {
  static readonly layer = Layer.effect(
    HistoryImport,
    Effect.gen(function* () {
      const history = yield* ClaudeHistory
      const repo = yield* SessionRepo
      const projects = yield* ProjectService
      const events = yield* SessionEvents
      const approvals = yield* ApprovalService
      const preferences = yield* PreferencesService
      const scope = yield* Effect.scope
      const lock = yield* Semaphore.make(1)

      const republish = (sessionId: SessionId) =>
        Effect.gen(function* () {
          const session = yield* repo.get(sessionId)
          if (Option.isNone(session)) return
          const page = yield* repo.transcriptPage(sessionId)
          const snapshot: SessionEvent = {
            _tag: "Snapshot",
            session: session.value,
            ...page,
            approvals: yield* approvals.listForSession(sessionId),
            usage: yield* repo.getUsage(sessionId),
          }
          yield* events.publish(sessionId, snapshot)
        })

      const importOne = (project: Project, conversation: ClaudeConversation, index: ImportIndex) =>
        Effect.gen(function* () {
          const known = index.bySource.get(conversation.sessionId)
          if (
            known !== undefined &&
            (known.mtime === null || known.mtime >= conversation.lastModified)
          ) {
            return false
          }
          if (known === undefined && index.sdkSessionIds.has(conversation.sessionId)) return false

          const id = known?.sessionId ?? SessionId.make(randomUUID())
          const entries = yield* history.messages(conversation.sessionId, project.localPath)
          const updatedAt = iso(conversation.lastModified)
          const transcript = importTranscript(id, entries, updatedAt)
          if (!transcript.hasConversation) return false

          const createdAt =
            conversation.createdAt === undefined
              ? (transcript.messages[0]?.message.createdAt ?? updatedAt)
              : iso(conversation.createdAt)
          const title = conversation.title.trim().split("\n")[0]?.slice(0, MAX_TITLE)
          const session: Session = {
            id,
            projectId: project.id,
            provider: "claude-code",
            sdkSessionId: conversation.sessionId,
            title: title || "Claude Code conversation",
            branch: conversation.gitBranch ?? project.defaultBranch,
            worktreePath: project.localPath,
            inWorktree: false,
            model: null,
            effort: null,
            autonomy: DEFAULT_AUTONOMY,
            status: "ended",
            origin: "claude-code",
            createdAt,
            updatedAt,
          }
          const written = yield* repo.writeImported({
            session,
            sourceId: conversation.sessionId,
            mtime: conversation.lastModified,
            messages: transcript.messages,
            toolCalls: transcript.toolCalls,
          })
          if (written && known !== undefined) yield* republish(id)
          return written
        })

      const syncProject = (projectId: string) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            if (!(yield* preferences.history).importFromCli) return 0
            const project = yield* projects.get(projectId)
            const conversations = yield* history.list(project.localPath)
            const index = yield* repo.importIndex
            let written = 0
            for (const conversation of conversations) {
              const wrote = yield* importOne(project, conversation, index).pipe(
                Effect.catchTag("ClaudeHistoryUnavailable", (error) =>
                  Effect.as(
                    Effect.logWarning(
                      `Could not import Claude Code conversation ${conversation.sessionId}: ${error.reason}`,
                    ),
                    false,
                  ),
                ),
              )
              if (wrote) written += 1
            }
            if (written > 0) yield* events.publishListChanged
            return written
          }).pipe(
            Effect.catchTag("ClaudeHistoryUnavailable", (error) =>
              Effect.as(
                Effect.logWarning(`Could not read Claude Code's history: ${error.reason}`),
                0,
              ),
            ),
          ),
        )

      const syncAll = Effect.gen(function* () {
        for (const project of yield* projects.list) {
          yield* syncProject(project.id).pipe(Effect.ignore)
        }
      })

      const syncInBackground = (projectId: string) =>
        syncProject(projectId).pipe(Effect.ignore, Effect.forkIn(scope), Effect.asVoid)

      const syncAllInBackground = syncAll.pipe(Effect.forkIn(scope), Effect.asVoid)

      return HistoryImport.of({ syncProject, syncAll, syncInBackground, syncAllInBackground })
    }),
  )

  static readonly background = Layer.effectDiscard(
    Effect.gen(function* () {
      const imports = yield* HistoryImport
      yield* imports.syncAll.pipe(
        Effect.repeat(Schedule.spaced(SYNC_INTERVAL)),
        Effect.delay(FIRST_SYNC_DELAY),
        Effect.forkScoped,
      )
    }),
  )
}
