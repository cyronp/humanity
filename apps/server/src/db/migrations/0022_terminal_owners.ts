import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE terminals_next (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      title TEXT,
      opener TEXT NOT NULL,
      shell TEXT NOT NULL,
      cwd TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK (session_id IS NULL OR project_id IS NULL)
    )
  `
  yield* sql`
    INSERT INTO terminals_next (id, session_id, project_id, ordinal, title, opener, shell, cwd, created_at)
    SELECT id, session_id, NULL, ordinal, title, opener, shell, cwd, created_at FROM terminals
  `
  yield* sql`DROP TABLE terminals`
  yield* sql`ALTER TABLE terminals_next RENAME TO terminals`
  yield* sql`CREATE INDEX terminals_by_session ON terminals(session_id)`
  yield* sql`CREATE INDEX terminals_by_project ON terminals(project_id)`
})
