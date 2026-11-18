import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE codex_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config_dir TEXT,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`ALTER TABLE sessions RENAME COLUMN claude_account_id TO account_id`
})
