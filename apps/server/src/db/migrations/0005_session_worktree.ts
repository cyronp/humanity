import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Sessions start in the project's checkout and get a worktree on request.
 * Every earlier session was created with one.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN in_worktree INTEGER NOT NULL DEFAULT 1`
})
