import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Threads run on their own by default, and a request is allowed or denied as a
 * whole. A project can set the autonomy its new threads start with (`NULL`
 * follows the human's default for every project), and a denied file change
 * keeps what the human told the agent. `projects.policy_json` and
 * `hunk_decisions` are no longer read or written.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE projects ADD COLUMN default_autonomy TEXT`
  yield* sql`ALTER TABLE proposed_changes ADD COLUMN comment TEXT`
})
