import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** How hard a session's model reasons. `NULL` means the model's default, as for every earlier session. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN effort TEXT`
})
