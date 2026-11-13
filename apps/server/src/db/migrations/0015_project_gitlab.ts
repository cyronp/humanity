import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * A project can come from GitLab too: the instance its `origin` points at and
 * the repository's `group/name` there. Both `NULL` for any other project.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE projects ADD COLUMN gitlab_host TEXT`
  yield* sql`ALTER TABLE projects ADD COLUMN gitlab_full_path TEXT`
})
