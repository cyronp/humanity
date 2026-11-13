import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The human's answers to a question the agent asked, as a JSON object keyed by question text. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE confirmations ADD COLUMN answers_json TEXT`
})
