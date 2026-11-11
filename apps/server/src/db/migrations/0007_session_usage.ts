import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The context window and plan limits a session last heard about, as JSON. `NULL` until the agent reports them. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN usage_json TEXT`
})
