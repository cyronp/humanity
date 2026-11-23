import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE turn_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      account_key TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cache_creation_tokens INTEGER NOT NULL,
      cost_usd REAL,
      duration_ms INTEGER NOT NULL,
      estimated INTEGER NOT NULL,
      ended_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX turn_usage_ended ON turn_usage(ended_at)`
  yield* sql`
    INSERT INTO turn_usage (
      id, session_id, project_id, provider, account_key, model,
      input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
      cost_usd, duration_ms, estimated, ended_at
    )
    SELECT
      messages.id,
      sessions.id,
      sessions.project_id,
      sessions.provider,
      COALESCE(sessions.account_id, ''),
      sessions.model,
      COALESCE(json_extract(messages.normalized_json, '$.usage.inputTokens'), 0),
      COALESCE(json_extract(messages.normalized_json, '$.usage.outputTokens'), 0),
      COALESCE(json_extract(messages.normalized_json, '$.usage.cacheReadTokens'), 0),
      COALESCE(json_extract(messages.normalized_json, '$.usage.cacheCreationTokens'), 0),
      CASE WHEN sessions.provider = 'claude-code'
        THEN json_extract(messages.normalized_json, '$.costUsd') ELSE NULL END,
      COALESCE(json_extract(messages.normalized_json, '$.durationMs'), 0),
      1,
      messages.created_at
    FROM messages JOIN sessions ON sessions.id = messages.session_id
    WHERE messages.role = 'result'
  `
  yield* sql`
    CREATE TABLE plan_usage_samples (
      provider TEXT NOT NULL,
      account_key TEXT NOT NULL,
      window TEXT NOT NULL,
      utilization REAL NOT NULL,
      resets_at TEXT,
      sampled_at TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX plan_usage_samples_at ON plan_usage_samples(sampled_at)`
})
