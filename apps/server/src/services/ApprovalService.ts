import {
  type Approval,
  ApprovalAlreadyDecided,
  type ApprovalDecision,
  ApprovalNotFound,
  ChangeId,
  ConfirmationId,
  ConfirmationStatus,
  Hunk,
  type PendingConfirmation,
  type ProposedChange,
  ProposedChangeStatus,
  QUESTION_TOOL,
  QuestionAnswers,
  SessionId,
  TALK_ABOUT_IT_MESSAGE,
} from "@humanity/contracts"
import { Context, DateTime, Deferred, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import type { PermissionDecision } from "../agent/AgentRunner.ts"
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
  comment: Schema.NullOr(Schema.String),
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
  ...(row.comment === null ? {} : { comment: row.comment }),
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
  answers_json: Schema.NullOr(Schema.fromJsonString(QuestionAnswers)),
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
  ...(row.answers_json === null ? {} : { answers: row.answers_json }),
  createdAt: row.created_at,
  ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
})

const asRecord = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}

const HunksJson = Schema.fromJsonString(Schema.Array(Hunk))

const interruptedMessage =
  "The session was interrupted before the human decided. Nothing was applied."

/** What the agent is told when the human denies a file change. Nothing was written. */
export const changeDeniedMessage = (filePath: string, comment: string | undefined): string =>
  comment
    ? `DENIED by the human reviewer: your change to ${filePath} was not applied and the file on disk is unchanged. They said: ${comment}`
    : `DENIED by the human reviewer: your change to ${filePath} was not applied and the file on disk is unchanged. Ask how to proceed if the change is necessary.`

/** How a request is decided, whichever kind it is. */
export interface DecisionOptions {
  readonly decision: ApprovalDecision
  /** Sent to the agent with a denial. */
  readonly comment?: string | undefined
  /** Also stop asking about this tool for the rest of the thread. Only with `allow`. */
  readonly allowForSession?: boolean | undefined
}

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
    /** The whole file change: allowed, the agent's tool applies it; denied, nothing is written. */
    readonly decideChange: (
      changeId: string,
      options: DecisionOptions,
    ) => Effect.Effect<ProposedChange, ApprovalNotFound | ApprovalAlreadyDecided>
    readonly decideConfirmation: (
      confirmationId: string,
      options: DecisionOptions & {
        /** The answers to an `AskUserQuestion` call; they become the tool's input. */
        readonly answers?: QuestionAnswers | undefined
      },
    ) => Effect.Effect<PendingConfirmation, ApprovalNotFound | ApprovalAlreadyDecided>
    /**
     * Whether the human chose to stop being asked about this tool in this
     * thread. Kept in memory: after a daemon restart the thread asks again.
     */
    readonly allowsInSession: (sessionId: string, toolName: string) => boolean
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
      const events = yield* SessionEvents

      const waiters = new Map<string, Waiter>()
      /** Per thread, the tools the human allowed for the rest of it. */
      const allowedInSession = new Map<string, Set<string>>()
      const allowsInSession = (sessionId: string, toolName: string) =>
        allowedInSession.get(sessionId)?.has(toolName) === true
      const allowInSession = (sessionId: string, toolName: string) => {
        const tools = allowedInSession.get(sessionId) ?? new Set<string>()
        tools.add(toolName)
        allowedInSession.set(sessionId, tools)
      }
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
              comment: change.comment ?? null,
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
            answers_json:
              confirmation.answers === undefined ? null : JSON.stringify(confirmation.answers),
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

      const decideChange = (changeId: string, options: DecisionOptions) =>
        decisionLock.withPermits(1)(
          Effect.gen(function* () {
            const stored = yield* getChange(changeId)
            const waiter = yield* pendingWaiter(
              changeId,
              Option.map(stored, (change) => change.status),
            )
            const change = Option.getOrThrow(stored)
            const allowed = options.decision === "allow"
            const comment = options.comment?.trim()

            if (allowed && options.allowForSession === true) {
              allowInSession(change.sessionId, change.toolName)
            }

            const resolved: ProposedChange = {
              ...change,
              // Every hunk shares the verdict, so the diff reads as applied or not.
              hunks: change.hunks.map((hunk) => ({
                ...hunk,
                status: allowed ? ("approved" as const) : ("rejected" as const),
              })),
              status: allowed ? "applied" : "rejected",
              ...(!allowed && comment ? { comment } : {}),
              decidedAt: yield* now,
            }
            yield* saveChangeOutcome(resolved)
            yield* publish({ _tag: "change", change: resolved }, "ApprovalResolved")
            yield* Deferred.succeed(
              waiter.deferred,
              allowed
                ? { behavior: "allow" }
                : { behavior: "deny", message: changeDeniedMessage(change.filePath, comment) },
            )
            return resolved
          }),
        )

      const decideConfirmation = (
        confirmationId: string,
        options: DecisionOptions & { readonly answers?: QuestionAnswers | undefined },
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
            const isQuestion = confirmation.toolName === QUESTION_TOOL
            const answers = isQuestion && options.decision === "allow" ? options.answers : undefined

            // A question is answered each time; it can never be allowed once and for all.
            if (options.decision === "allow" && options.allowForSession === true && !isQuestion) {
              allowInSession(confirmation.sessionId, confirmation.toolName)
            }

            const resolved: PendingConfirmation = {
              ...confirmation,
              status: options.decision === "allow" ? "allowed" : "denied",
              ...(comment ? { comment } : {}),
              ...(answers === undefined ? {} : { answers }),
              decidedAt: yield* now,
            }
            yield* saveConfirmationOutcome(resolved)
            yield* publish({ _tag: "confirmation", confirmation: resolved }, "ApprovalResolved")
            const decision: PermissionDecision =
              options.decision === "allow"
                ? {
                    behavior: "allow",
                    ...(answers === undefined
                      ? {}
                      : { updatedInput: { ...asRecord(confirmation.input), answers } }),
                  }
                : {
                    behavior: "deny",
                    message: comment
                      ? `DENIED by the human reviewer: ${comment}`
                      : isQuestion
                        ? TALK_ABOUT_IT_MESSAGE
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
        allowsInSession,
        listForSession,
        pendingCount,
        expireSession,
      })
    }),
  )
}
