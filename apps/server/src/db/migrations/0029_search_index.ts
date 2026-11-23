import { MessageContent } from "@humanity/contracts"
import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { searchEntries } from "../searchIndex.ts"

const BATCH = 500

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(MessageContent))

interface Row {
  readonly rowid: number
  readonly id: string
  readonly session_id: string
  readonly normalized_json: string
}

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE VIRTUAL TABLE search_index USING fts5(
      session_id UNINDEXED,
      message_id UNINDEXED,
      kind UNINDEXED,
      body,
      tokenize = 'trigram'
    )
  `
  let after = 0
  while (true) {
    const rows = yield* sql<Row>`
      SELECT rowid, id, session_id, normalized_json FROM messages
      WHERE rowid > ${after} AND role IN ('user', 'assistant')
      ORDER BY rowid LIMIT ${BATCH}
    `
    if (rows.length === 0) break
    for (const row of rows) {
      const content = decode(row.normalized_json)
      if (Option.isNone(content)) continue
      for (const entry of searchEntries(content.value)) {
        yield* sql`INSERT INTO search_index (session_id, message_id, kind, body) VALUES (${row.session_id}, ${row.id}, ${entry.kind}, ${entry.body})`
      }
    }
    after = rows[rows.length - 1]?.rowid ?? after
    if (rows.length < BATCH) break
  }
})
