import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE projects ADD COLUMN gitlab_host TEXT`
  yield* sql`ALTER TABLE projects ADD COLUMN gitlab_full_path TEXT`
})
