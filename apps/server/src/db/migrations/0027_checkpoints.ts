import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE checkpoints (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      folder TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX checkpoints_message ON checkpoints(session_id, message_id)`
  yield* sql`ALTER TABLE sessions ADD COLUMN pending_fork TEXT`
})
