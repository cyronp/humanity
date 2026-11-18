import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN origin TEXT NOT NULL DEFAULT 'humanity'`
  yield* sql`ALTER TABLE sessions ADD COLUMN import_source_id TEXT`
  yield* sql`ALTER TABLE sessions ADD COLUMN import_mtime INTEGER`
  yield* sql`CREATE UNIQUE INDEX sessions_import_source ON sessions(import_source_id)`
})
