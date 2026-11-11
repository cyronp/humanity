import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Threads imported from Claude Code's own history. `import_source_id` is the
 * Claude Code session the thread came from, kept even if resuming changes
 * `sdk_session_id`, so a conversation is never imported twice.
 * `import_mtime` is when that transcript last changed as of the import; it
 * goes back to `NULL` once the human continues the thread in Humanity, which
 * stops further refreshes from the transcript.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN origin TEXT NOT NULL DEFAULT 'humanity'`
  yield* sql`ALTER TABLE sessions ADD COLUMN import_source_id TEXT`
  yield* sql`ALTER TABLE sessions ADD COLUMN import_mtime INTEGER`
  yield* sql`CREATE UNIQUE INDEX sessions_import_source ON sessions(import_source_id)`
})
