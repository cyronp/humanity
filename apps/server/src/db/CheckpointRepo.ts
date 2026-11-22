import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const CheckpointKind = Schema.Literals(["turn", "before_rewind"])
export type CheckpointKind = typeof CheckpointKind.Type

export interface Checkpoint {
  readonly id: string
  readonly sessionId: string
  readonly messageId: string
  readonly kind: CheckpointKind
  readonly commit: string
  readonly folder: string
  readonly createdAt: string
}

const CheckpointRow = Schema.Struct({
  id: Schema.String,
  session_id: Schema.String,
  message_id: Schema.String,
  kind: CheckpointKind,
  commit_sha: Schema.String,
  folder: Schema.String,
  created_at: Schema.String,
})

const toCheckpoint = (row: typeof CheckpointRow.Type): Checkpoint => ({
  id: row.id,
  sessionId: row.session_id,
  messageId: row.message_id,
  kind: row.kind,
  commit: row.commit_sha,
  folder: row.folder,
  createdAt: row.created_at,
})

export class CheckpointRepo extends Context.Service<
  CheckpointRepo,
  {
    readonly insert: (checkpoint: Checkpoint) => Effect.Effect<void>
    readonly find: (
      sessionId: string,
      messageId: string,
      kind: CheckpointKind,
    ) => Effect.Effect<Option.Option<Checkpoint>>
    readonly latest: (sessionId: string) => Effect.Effect<Option.Option<Checkpoint>>
    readonly removeForMessages: (
      sessionId: string,
      messageIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>
  }
>()("humanity/CheckpointRepo") {
  static readonly layer = Layer.effect(
    CheckpointRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findOne = SqlSchema.findOneOption({
        Request: Schema.Struct({
          sessionId: Schema.String,
          messageId: Schema.String,
          kind: Schema.String,
        }),
        Result: CheckpointRow,
        execute: ({ sessionId, messageId, kind }) =>
          sql`SELECT * FROM checkpoints WHERE session_id = ${sessionId} AND message_id = ${messageId} AND kind = ${kind} ORDER BY rowid DESC LIMIT 1`,
      })
      const findLatest = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: CheckpointRow,
        execute: (sessionId) =>
          sql`SELECT * FROM checkpoints WHERE session_id = ${sessionId} ORDER BY rowid DESC LIMIT 1`,
      })

      const insert = (checkpoint: Checkpoint) =>
        sql`
          INSERT INTO checkpoints ${sql.insert({
            id: checkpoint.id,
            session_id: checkpoint.sessionId,
            message_id: checkpoint.messageId,
            kind: checkpoint.kind,
            commit_sha: checkpoint.commit,
            folder: checkpoint.folder,
            created_at: checkpoint.createdAt,
          })}
        `.pipe(Effect.asVoid, Effect.orDie)

      const find = (sessionId: string, messageId: string, kind: CheckpointKind) =>
        findOne({ sessionId, messageId, kind }).pipe(
          Effect.map(Option.map(toCheckpoint)),
          Effect.orDie,
        )

      const latest = (sessionId: string) =>
        findLatest(sessionId).pipe(Effect.map(Option.map(toCheckpoint)), Effect.orDie)

      const removeForMessages = (sessionId: string, messageIds: ReadonlyArray<string>) =>
        messageIds.length === 0
          ? Effect.void
          : Effect.forEach(
              Array.from({ length: Math.ceil(messageIds.length / 500) }, (_, index) =>
                messageIds.slice(index * 500, (index + 1) * 500),
              ),
              (chunk) =>
                sql`DELETE FROM checkpoints WHERE session_id = ${sessionId} AND ${sql.in("message_id", chunk)}`,
              { discard: true },
            ).pipe(Effect.orDie)

      return CheckpointRepo.of({ insert, find, latest, removeForMessages })
    }),
  )
}
