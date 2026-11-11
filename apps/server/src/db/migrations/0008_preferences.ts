import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The human's own choices that belong to no project or session, one JSON value per key. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE preferences (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    )
  `
})
