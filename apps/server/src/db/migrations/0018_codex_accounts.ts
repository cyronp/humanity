import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Codex accounts added next to the default login, kept like Claude's: a name
 * and, for a folder the human already had, its path (`NULL` is the folder
 * Humanity made under `codex-accounts/`). The credential stays in the folder.
 *
 * A thread runs as an account of its own provider, so the column that says
 * which one loses Claude's name: `sessions.account_id`, where `NULL` is the
 * provider's default login.
 */
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
