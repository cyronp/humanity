import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE terminals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      title TEXT,
      opener TEXT NOT NULL,
      shell TEXT NOT NULL,
      cwd TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX terminals_by_session ON terminals(session_id)`
})
