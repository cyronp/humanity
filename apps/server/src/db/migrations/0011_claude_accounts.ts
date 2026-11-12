import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Claude accounts added next to the default login. Only the name is stored:
 * each account's credential stays in its own Claude Code config folder.
 * `sessions.claude_account_id` is the account a thread runs as; `NULL` is the
 * default login.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE claude_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`ALTER TABLE sessions ADD COLUMN claude_account_id TEXT`
})
