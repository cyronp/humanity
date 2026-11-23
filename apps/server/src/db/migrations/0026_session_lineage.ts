import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL`
  yield* sql`ALTER TABLE sessions ADD COLUMN relation TEXT`
  yield* sql`ALTER TABLE sessions ADD COLUMN forked_at_message_id TEXT`
  yield* sql`CREATE INDEX sessions_parent ON sessions(parent_session_id)`
})
