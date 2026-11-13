import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The tool's name when this migration was written; it must not follow later renames. */
const OPEN_THREAD_TOOL = "mcp__humanity__open_thread"

/**
 * Projects added before Humanity's `open_thread` tool existed got the rule new
 * projects started with: the tool runs without asking. Per-project tool
 * policies are gone since `0013`; this stays for databases that already ran it.
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
