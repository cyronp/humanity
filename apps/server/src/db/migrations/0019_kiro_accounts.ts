import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE kiro_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config_dir TEXT,
      created_at TEXT NOT NULL
    )
  `
})
