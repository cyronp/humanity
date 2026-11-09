import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL UNIQUE,
      github_full_name TEXT,
      default_branch TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `

  yield* sql`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sdk_session_id TEXT,
      title TEXT NOT NULL,
      branch TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX sessions_project ON sessions(project_id, created_at)`

  yield* sql`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      raw_json TEXT,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX messages_session ON messages(session_id, created_at)`

  yield* sql`
    CREATE TABLE tool_calls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tool_use_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      UNIQUE (session_id, tool_use_id)
    )
  `

  yield* sql`
    CREATE TABLE proposed_changes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tool_use_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      original_content TEXT NOT NULL,
      proposed_content TEXT NOT NULL,
      hunks_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      decided_at TEXT
    )
  `
  yield* sql`CREATE INDEX proposed_changes_session ON proposed_changes(session_id, created_at)`

  yield* sql`
    CREATE TABLE hunk_decisions (
      id TEXT PRIMARY KEY,
      proposed_change_id TEXT NOT NULL REFERENCES proposed_changes(id) ON DELETE CASCADE,
      hunk_index INTEGER NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT,
      decided_at TEXT NOT NULL
    )
  `

  yield* sql`
    CREATE TABLE confirmations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tool_use_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      status TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT
    )
  `
  yield* sql`CREATE INDEX confirmations_session ON confirmations(session_id, created_at)`
})
