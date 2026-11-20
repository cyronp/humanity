import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE session_providers (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      account_key TEXT NOT NULL,
      sdk_session_id TEXT NOT NULL,
      cwd TEXT NOT NULL,
      seen_entries INTEGER NOT NULL,
      parked_at TEXT NOT NULL,
      PRIMARY KEY (session_id, provider, account_key)
    )
  `
  yield* sql`ALTER TABLE sessions ADD COLUMN pending_handoff TEXT`
})
