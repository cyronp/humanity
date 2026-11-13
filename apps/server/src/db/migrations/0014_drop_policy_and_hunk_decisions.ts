import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Removes what stopped being used in `0013`: each project's tool policy, and
 * the per-hunk decisions of file changes. A change keeps its own outcome and
 * its hunks in `proposed_changes`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE projects DROP COLUMN policy_json`
  yield* sql`DROP TABLE hunk_decisions`
})
