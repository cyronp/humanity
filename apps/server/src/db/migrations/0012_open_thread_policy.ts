import { Effect } from "effect"
import { SqlClient } from "effect/sql"

const OPEN_THREAD_TOOL = "mcp__humanity__open_thread"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    UPDATE projects
    SET policy_json = json_insert(
      policy_json,
      '$.rules[#]',
      json_object('pattern', ${OPEN_THREAD_TOOL}, 'mode', 'auto')
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(projects.policy_json, '$.rules') AS rule
      WHERE json_extract(rule.value, '$.pattern') = ${OPEN_THREAD_TOOL}
    )
  `
})
