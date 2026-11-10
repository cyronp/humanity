import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The model a session runs on. `NULL` means Claude Code's default, as for every earlier session. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN model TEXT`
})
