import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * An account can run on a Claude Code config folder the human already has,
 * like `~/.claude-personal`. `NULL` is the folder Humanity made for it under
 * its own `accounts/` directory.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE claude_accounts ADD COLUMN config_dir TEXT`
})
