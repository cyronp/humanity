import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** Files the human attached to a message. The bytes are stored under `<home>/attachments/<sessionId>/<id>`. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX attachments_session_id ON attachments (session_id)`
})
