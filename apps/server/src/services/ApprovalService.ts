import {
  type Approval,
  ApprovalAlreadyDecided,
  ApprovalNotFound,
  ChangeId,
  ConfirmationId,
  ConfirmationStatus,
  Hunk,
  type HunkDecisionInput,
  IncompleteReview,
  type PendingConfirmation,
  type ProjectNotFound,
  type ProposedChange,
  ProposedChangeStatus,
  SessionId,
} from "@humanity/contracts"
import {
  applyHunks,
  approvedIndexes,
  formatPartialApplicationMessage,
  formatRejectionMessage,
  reviewOutcome,
  withDecisions,
} from "@humanity/diff"
import {
  Context,
  DateTime,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schema,
  Semaphore,
} from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import type { PermissionDecision } from "../agent/AgentRunner.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { isInsideDir } from "../paths.ts"
import { PolicyService } from "./PolicyService.ts"
import { SessionEvents } from "./SessionEvents.ts"

/** An approval the agent is blocked on, with the deferred its `canUseTool` awaits. */
interface Waiter {
  readonly sessionId: string
  readonly deferred: Deferred.Deferred<PermissionDecision>
}

const ChangeRow = Schema.Struct({
  id: ChangeId,
  session_id: SessionId,
  tool_use_id: Schema.String,
  tool_name: Schema.String,
  file_path: Schema.String,
  kind: Schema.Literals(["create", "modify"]),
  original_content: Schema.String,
  proposed_content: Schema.String,
  hunks_json: Schema.fromJsonString(Schema.Array(Hunk)),
  status: ProposedChangeStatus,
  created_at: Schema.String,
  decided_at: Schema.NullOr(Schema.String),
})

const toChange = (row: typeof ChangeRow.Type): ProposedChange => ({
  id: row.id,
  sessionId: row.session_id,
  toolUseId: row.tool_use_id,
  toolName: row.tool_name,
  filePath: row.file_path,
  kind: row.kind,
  originalContent: row.original_content,
  proposedContent: row.proposed_content,
  hunks: row.hunks_json,
  status: row.status,
  createdAt: row.created_at,
  ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
})

const ConfirmationRow = Schema.Struct({
  id: ConfirmationId,
  session_id: SessionId,
  tool_use_id: Schema.String,
  tool_name: Schema.String,
  input_json: Schema.fromJsonString(Schema.Unknown),
  status: ConfirmationStatus,
  comment: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  decided_at: Schema.NullOr(Schema.String),
})

const toConfirmation = (row: typeof ConfirmationRow.Type): PendingConfirmation => ({
  id: row.id,
  sessionId: row.session_id,
  toolUseId: row.tool_use_id,
  toolName: row.tool_name,
  input: row.input_json,
  status: row.status,
  ...(row.comment === null ? {} : { comment: row.comment }),
  createdAt: row.created_at,
  ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
})

const HunksJson = Schema.fromJsonString(Schema.Array(Hunk))

const interruptedMessage =
  "The session was interrupted before the human decided. Nothing was applied."

const conflictMessage = (filePath: string) =>
  `NOT APPLIED: ${filePath} changed on disk while your change was under review, so none of it was written. Re-read the file before proposing the change again.`

const byCreation = (a: Approval, b: Approval) => {
  const at = (approval: Approval) =>
    approval._tag === "change" ? approval.change.createdAt : approval.confirmation.createdAt
  return at(a).localeCompare(at(b))
}

/**
 * The registry of everything the agent is waiting on. A request persists the
 * approval, publishes it and parks the agent on a `Deferred`; a decision
 * applies the outcome, persists it and completes that `Deferred`.
 */
export class ApprovalService extends Context.Service<
  ApprovalService,
  {
    /** Blocks until the human decides. Interruption expires the request. */
    readonly requestChange: (change: ProposedChange) => Effect.Effect<PermissionDecision>
    readonly requestConfirmation: (
      confirmation: PendingConfirmation,
    ) => Effect.Effect<PermissionDecision>
    readonly decideChange: (
      changeId: string,
      decisions: ReadonlyArray<HunkDecisionInput>,
    ) => Effect.Effect<ProposedChange, ApprovalNotFound | ApprovalAlreadyDecided | IncompleteReview>
    readonly decideConfirmation: (
      confirmationId: string,
      options: {
        readonly decision: "allow" | "deny"
        readonly comment?: string | undefined
        readonly alwaysAllow?: boolean | undefined
      },
    ) => Effect.Effect<
      PendingConfirmation,
      ApprovalNotFound | ApprovalAlreadyDecided | ProjectNotFound
    >
    /** Every approval of a session, oldest first. */
    readonly listForSession: (sessionId: string) => Effect.Effect<ReadonlyArray<Approval>>
    readonly pendingCount: (sessionId: string) => Effect.Effect<number>
    /** Releases everything a session's agent waits on, telling it nothing was applied. */
    readonly expireSession: (sessionId: string) => Effect.Effect<void>
  }
>()("humanity/ApprovalService") {
  static readonly layer = Layer.effect(
    ApprovalService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const fs = yield* FileSystem.FileSystem
      const events = yield* SessionEvents
      const sessions = yield* SessionRepo
      const policies = yield* PolicyService

      const waiters = new Map<string, Waiter>()
      const decisionLock = yield* Semaphore.make(1)
      const now = Effect.map(DateTime.now, DateTime.formatIso)

      const findChange = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: ChangeRow,
        execute: (id) => sql`SELECT * FROM proposed_changes WHERE id = ${id}`,
      })
      const findChanges = SqlSchema.findAll({
        Request: Schema.String,
        Result: ChangeRow,
        execute: (sessionId) =>
          sql`SELECT * FROM proposed_changes WHERE session_id = ${sessionId} ORDER BY rowid`,
      })
      const findConfirmation = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: ConfirmationRow,
        execute: (id) => sql`SELECT * FROM confirmations WHERE id = ${id}`,
      })
      const findConfirmations = SqlSchema.findAll({
        Request: Schema.String,
        Result: ConfirmationRow,
        execute: (sessionId) =>
          sql`SELECT * FROM confirmations WHERE session_id = ${sessionId} ORDER BY rowid`,
      })

      const getChange = (id: string) =>
        findChange(id).pipe(Effect.map(Option.map(toChange)), Effect.orDie)
      const getConfirmation = (id: string) =>
        findConfirmation(id).pipe(Effect.map(Option.map(toConfirmation)), Effect.orDie)

      const publish = (approval: Approval, tag: "ApprovalRequested" | "ApprovalResolved") =>
        events.publish(
          approval._tag === "change" ? approval.change.sessionId : approval.confirmation.sessionId,
          { _tag: tag, approval },
        )

      const saveChangeOutcome = (change: ProposedChange) =>
        Effect.gen(function* () {
          const hunks = yield* Schema.encodeEffect(HunksJson)(change.hunks)
          yield* sql`
            UPDATE proposed_changes SET ${sql.update({
              hunks_json: hunks,
              status: change.status,
              decided_at: change.decidedAt ?? null,
            })}
            WHERE id = ${change.id}
          `
        }).pipe(Effect.orDie)

      const saveConfirmationOutcome = (confirmation: PendingConfirmation) =>
        sql`
          UPDATE confirmations SET ${sql.update({
            status: confirmation.status,
            comment: confirmation.comment ?? null,
            decided_at: confirmation.decidedAt ?? null,
          })}
          WHERE id = ${confirmation.id}
        `.pipe(Effect.asVoid, Effect.orDie)

      /** Marks a still-pending request expired and releases its waiter with a denial. */
      const expire = (id: string) =>
        Effect.gen(function* () {
          const waiter = waiters.get(id)
          waiters.delete(id)
          const decidedAt = yield* now
          const change = yield* getChange(id)
          if (Option.isSome(change) && change.value.status === "pending") {
            const expired: ProposedChange = { ...change.value, status: "expired", decidedAt }
            yield* saveChangeOutcome(expired)
            yield* publish({ _tag: "change", change: expired }, "ApprovalResolved")
          }
          const confirmation = yield* getConfirmation(id)
          if (Option.isSome(confirmation) && confirmation.value.status === "pending") {
            const expired: PendingConfirmation = {
              ...confirmation.value,
              status: "expired",
              decidedAt,
            }
            yield* saveConfirmationOutcome(expired)
            yield* publish({ _tag: "confirmation", confirmation: expired }, "ApprovalResolved")
          }
          if (waiter !== undefined) {
            yield* Deferred.succeed(waiter.deferred, {
              behavior: "deny",
              message: interruptedMessage,
            })
          }
        })

      /** Parks the caller until a decision completes its deferred. */
      const wait = (id: string, sessionId: string, register: Effect.Effect<void>) =>
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<PermissionDecision>()
          waiters.set(id, { sessionId, deferred })
          yield* register
          return yield* Deferred.await(deferred)
        }).pipe(
          Effect.onInterrupt(() => decisionLock.withPermits(1)(expire(id))),
          Effect.ensuring(Effect.sync(() => waiters.delete(id))),
        )

      const requestChange = (change: ProposedChange) =>
        wait(
          change.id,
          change.sessionId,
          Effect.gen(function* () {
            const hunks = yield* Schema.encodeEffect(HunksJson)(change.hunks).pipe(Effect.orDie)
            yield* sql`
              INSERT INTO proposed_changes ${sql.insert({
                id: change.id,
                session_id: change.sessionId,
                tool_use_id: change.toolUseId,
                tool_name: change.toolName,
                file_path: change.filePath,
                kind: change.kind,
                original_content: change.originalContent,
                proposed_content: change.proposedContent,
                hunks_json: hunks,
                status: change.status,
                created_at: change.createdAt,
                decided_at: null,
              })}
            `.pipe(Effect.orDie)
            yield* publish({ _tag: "change", change }, "ApprovalRequested")
          }),
        )

      const requestConfirmation = (confirmation: PendingConfirmation) =>
        wait(
          confirmation.id,
          confirmation.sessionId,
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO confirmations ${sql.insert({
                id: confirmation.id,
                session_id: confirmation.sessionId,
                tool_use_id: confirmation.toolUseId,
                tool_name: confirmation.toolName,
                input_json: JSON.stringify(confirmation.input ?? null),
                status: confirmation.status,
                comment: null,
                created_at: confirmation.createdAt,
                decided_at: null,
              })}
            `.pipe(Effect.orDie)
            yield* publish({ _tag: "confirmation", confirmation }, "ApprovalRequested")
          }),
        )

      /** The waiter for a pending request, or the reason it can't be decided. */
      const pendingWaiter = (id: string, status: Option.Option<string>) =>
        Effect.gen(function* () {
          if (Option.isNone(status)) return yield* new ApprovalNotFound({ id })
          if (status.value !== "pending") {
            return yield* new ApprovalAlreadyDecided({ id, status: status.value })
          }
          const waiter = waiters.get(id)
          if (waiter === undefined) return yield* new ApprovalNotFound({ id })
          return waiter
        })

      /** Writes the approved hunks for a partial approval, unless the file moved underneath. */
      const applyPartially = (change: ProposedChange) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(change.sessionId)
          if (Option.isNone(session)) return false
          const worktree = session.value.worktreePath
          const path = join(worktree, change.filePath)
          if (!isInsideDir(worktree, path)) return false

          const exists = yield* fs.exists(path)
          const current = exists ? yield* fs.readFileString(path) : ""
          if (current !== change.originalContent || (!exists && change.kind === "modify")) {
            return false
          }
          const content = applyHunks(
            change.originalContent,
            change.hunks,
            approvedIndexes(change.hunks),
          )
          yield* fs.makeDirectory(dirname(path), { recursive: true })
          yield* fs.writeFileString(path, content)
          return true
        }).pipe(
          Effect.catch(() => Effect.succeed(false)),
          Effect.catchDefect(() => Effect.succeed(false)),
        )

      const decideChange = (changeId: string, decisions: ReadonlyArray<HunkDecisionInput>) =>
        decisionLock.withPermits(1)(
          Effect.gen(function* () {
            const stored = yield* getChange(changeId)
            const waiter = yield* pendingWaiter(
              changeId,
              Option.map(stored, (change) => change.status),
            )
            const change = Option.getOrThrow(stored)

            const decided = new Set(decisions.map((decision) => decision.index))
            const missing = change.hunks
              .map((hunk) => hunk.index)
              .filter((index) => !decided.has(index))
            if (missing.length > 0) return yield* new IncompleteReview({ missing })

            const hunks = withDecisions(change.hunks, decisions)
            const outcome = reviewOutcome(hunks)
            const decidedAt = yield* now
            let resolved: ProposedChange
            let decision: PermissionDecision

            if (outcome === "applied") {
              resolved = { ...change, hunks, status: "applied", decidedAt }
              decision = { behavior: "allow" }
            } else if (outcome === "rejected") {
              resolved = { ...change, hunks, status: "rejected", decidedAt }
              decision = {
                behavior: "deny",
                message: formatRejectionMessage(change.filePath, hunks),
              }
            } else {
              const candidate: ProposedChange = { ...change, hunks }
              const written = yield* applyPartially(candidate)
              resolved = {
                ...candidate,
                status: written ? "partially_applied" : "rejected",
                decidedAt,
              }
              decision = {
                behavior: "deny",
                message: written
                  ? formatPartialApplicationMessage(change.filePath, hunks)
                  : conflictMessage(change.filePath),
              }
            }

            yield* saveChangeOutcome(resolved)
            yield* Effect.forEach(
              hunks,
              (hunk) =>
                sql`
                  INSERT INTO hunk_decisions ${sql.insert({
                    id: randomUUID(),
                    proposed_change_id: change.id,
                    hunk_index: hunk.index,
                    decision: hunk.status,
                    comment: hunk.comment ?? null,
                    decided_at: decidedAt,
                  })}
                `,
              { discard: true },
            ).pipe(Effect.orDie)
            yield* publish({ _tag: "change", change: resolved }, "ApprovalResolved")
            yield* Deferred.succeed(waiter.deferred, decision)
            return resolved
          }),
        )

      const decideConfirmation = (
        confirmationId: string,
        options: {
          readonly decision: "allow" | "deny"
          readonly comment?: string | undefined
          readonly alwaysAllow?: boolean | undefined
        },
      ) =>
        decisionLock.withPermits(1)(
          Effect.gen(function* () {
            const stored = yield* getConfirmation(confirmationId)
            const waiter = yield* pendingWaiter(
              confirmationId,
              Option.map(stored, (confirmation) => confirmation.status),
            )
            const confirmation = Option.getOrThrow(stored)
            const comment = options.comment?.trim()

            if (options.decision === "allow" && options.alwaysAllow === true) {
              const session = yield* sessions.get(confirmation.sessionId)
              if (Option.isSome(session)) {
                yield* policies.allowTool(session.value.projectId, confirmation.toolName)
              }
            }

            const resolved: PendingConfirmation = {
              ...confirmation,
              status: options.decision === "allow" ? "allowed" : "denied",
              ...(comment ? { comment } : {}),
              decidedAt: yield* now,
            }
            yield* saveConfirmationOutcome(resolved)
            yield* publish({ _tag: "confirmation", confirmation: resolved }, "ApprovalResolved")
            const decision: PermissionDecision =
              options.decision === "allow"
                ? { behavior: "allow" }
                : {
                    behavior: "deny",
                    message: comment
                      ? `DENIED by the human reviewer: ${comment}`
                      : `DENIED by the human reviewer: do not run this ${confirmation.toolName} call. Ask how to proceed if it is necessary.`,
                  }
            yield* Deferred.succeed(waiter.deferred, decision)
            return resolved
          }),
        )

      const listForSession = (sessionId: string) =>
        Effect.gen(function* () {
          const changes = yield* findChanges(sessionId).pipe(Effect.orDie)
          const confirmations = yield* findConfirmations(sessionId).pipe(Effect.orDie)
          return [
            ...changes.map((row): Approval => ({ _tag: "change", change: toChange(row) })),
            ...confirmations.map((row): Approval => ({
              _tag: "confirmation",
              confirmation: toConfirmation(row),
            })),
          ].sort(byCreation)
        })

      const pendingCount = (sessionId: string) =>
        Effect.sync(
          () => [...waiters.values()].filter((waiter) => waiter.sessionId === sessionId).length,
        )

      const expireSession = (sessionId: string) =>
        decisionLock.withPermits(1)(
          Effect.forEach(
            [...waiters.entries()].filter(([, waiter]) => waiter.sessionId === sessionId),
            ([id]) => expire(id),
            { discard: true },
          ),
        )

      // Nobody is waiting on requests from before a restart; their agents are gone.
      const restartedAt = yield* now
      yield* sql`UPDATE proposed_changes SET status = 'expired', decided_at = ${restartedAt} WHERE status = 'pending'`.pipe(
        Effect.orDie,
      )
      yield* sql`UPDATE confirmations SET status = 'expired', decided_at = ${restartedAt} WHERE status = 'pending'`.pipe(
        Effect.orDie,
      )

      return ApprovalService.of({
        requestChange,
        requestConfirmation,
        decideChange,
        decideConfirmation,
        listForSession,
        pendingCount,
        expireSession,
      })
    }),
  )
}
