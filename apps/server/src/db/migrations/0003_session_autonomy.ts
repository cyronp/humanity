import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** How much a session's agent may do without asking. Earlier sessions follow the project's policy (`ask`). */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE sessions ADD COLUMN autonomy TEXT NOT NULL DEFAULT 'ask'`
})
