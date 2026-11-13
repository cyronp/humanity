import { OPEN_THREAD_TOOL } from "@humanity/contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Projects added before Humanity's `open_thread` tool existed get the rule new
 * projects start with: the tool runs without asking. Without it, their
 * `mcp__*` rule would hold every new thread for a confirmation. A project that
 * already has a rule for the tool keeps it.
 */
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
