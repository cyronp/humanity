import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE preferences (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    )
  `
})
