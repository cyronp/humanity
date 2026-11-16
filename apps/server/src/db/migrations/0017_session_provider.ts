import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The agent a thread runs on. Every thread before Codex ran on Claude Code. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude-code'`
})
