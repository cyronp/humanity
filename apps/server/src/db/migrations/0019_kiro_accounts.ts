import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Kiro (Beta) accounts added next to the default login, kept like Codex's: a
 * name and, for a folder the human already had, its path (`NULL` is the folder
 * Humanity made under `kiro-accounts/`). The credential stays in the folder.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE kiro_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config_dir TEXT,
      created_at TEXT NOT NULL
    )
  `
})
