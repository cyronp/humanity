import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * A snapshot reads the latest messages of a session, and each page of earlier
 * ones those just before a message, both in insertion order. An index on
 * `session_id` alone keeps its entries in rowid order within a session, so
 * those reads walk the index instead of sorting the whole transcript.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE INDEX messages_session_rowid ON messages(session_id)`
})
