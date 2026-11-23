import {
  type ChatMessage,
  type MessageContent,
  type MessageHit,
  ProjectId,
  SEARCH_LIMIT,
  SEARCH_MARK_END,
  SEARCH_MARK_START,
  SEARCH_MIN_LENGTH,
  SearchHitKind,
  SessionId,
} from "@humanity/contracts"
import { Effect, Schema } from "effect"
import { type SqlClient, SqlSchema } from "effect/sql"
import { describeCall } from "../agent/handoff.ts"

export interface SearchEntry {
  readonly kind: SearchHitKind
  readonly body: string
}

export const searchEntries = (content: MessageContent): ReadonlyArray<SearchEntry> => {
  switch (content._tag) {
    case "user":
      return content.text.trim() === "" ? [] : [{ kind: "human", body: content.text }]
    case "assistant": {
      const text = content.blocks
        .flatMap((block) => (block._tag === "text" ? [block.text] : []))
        .join("\n")
        .trim()
      return [
        ...(text === "" ? [] : [{ kind: "agent" as const, body: text }]),
        ...content.blocks.flatMap((block) =>
          block._tag === "tool_use"
            ? [{ kind: "tool" as const, body: describeCall(block.toolName, block.input) }]
            : [],
        ),
      ]
    }
    case "tool_results":
    case "result":
    case "system_init":
    case "notice":
    case "provider_switch":
    case "rewind":
    case "other":
      return []
  }
}

export const indexMessage = (sql: SqlClient.SqlClient, message: ChatMessage) =>
  Effect.forEach(
    searchEntries(message.content),
    (entry) =>
      sql`INSERT INTO search_index (session_id, message_id, kind, body) VALUES (${message.sessionId}, ${message.id}, ${entry.kind}, ${entry.body})`,
    { discard: true },
  )

export const unindexMessages = (
  sql: SqlClient.SqlClient,
  sessionId: string,
  messageIds: ReadonlyArray<string>,
) =>
  Effect.forEach(
    Array.from({ length: Math.ceil(messageIds.length / 500) }, (_, index) =>
      messageIds.slice(index * 500, (index + 1) * 500),
    ),
    (chunk) =>
      sql`DELETE FROM search_index WHERE session_id = ${sessionId} AND ${sql.in("message_id", chunk)}`,
    { discard: true },
  )

export const unindexSession = (sql: SqlClient.SqlClient, sessionId: string) =>
  sql`DELETE FROM search_index WHERE session_id = ${sessionId}`.pipe(Effect.asVoid)

export const matchExpression = (query: string): string | undefined => {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => [...term].length >= SEARCH_MIN_LENGTH)
  if (terms.length === 0) return undefined
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" ")
}

const HitRow = Schema.Struct({
  session_id: SessionId,
  project_id: ProjectId,
  message_id: Schema.String,
  kind: SearchHitKind,
  snippet: Schema.String,
  created_at: Schema.String,
})

export const searchMessages = (
  sql: SqlClient.SqlClient,
  options: {
    readonly query: string
    readonly projectIds?: ReadonlyArray<string> | undefined
    readonly limit?: number | undefined
  },
): Effect.Effect<ReadonlyArray<MessageHit>> => {
  const match = matchExpression(options.query)
  if (match === undefined) return Effect.succeed([])
  const limit = Math.max(1, Math.min(options.limit ?? SEARCH_LIMIT, 200))
  const projects = options.projectIds ?? []
  const find = SqlSchema.findAll({
    Request: Schema.Void,
    Result: HitRow,
    execute: () => sql`
      SELECT search_index.session_id AS session_id,
             sessions.project_id AS project_id,
             search_index.message_id AS message_id,
             search_index.kind AS kind,
             snippet(search_index, 3, ${SEARCH_MARK_START}, ${SEARCH_MARK_END}, '…', 64) AS snippet,
             messages.created_at AS created_at
      FROM search_index
      JOIN sessions ON sessions.id = search_index.session_id
      JOIN messages ON messages.id = search_index.message_id
      WHERE search_index MATCH ${match}
      ${projects.length === 0 ? sql`` : sql`AND ${sql.in("sessions.project_id", projects)}`}
      ORDER BY bm25(search_index), messages.created_at DESC
      LIMIT ${limit}
    `,
  })
  return find().pipe(
    Effect.map((rows) =>
      rows.map((row): MessageHit => ({
        sessionId: row.session_id,
        projectId: row.project_id,
        messageId: row.message_id,
        kind: row.kind,
        snippet: row.snippet,
        createdAt: row.created_at,
      })),
    ),
    Effect.orElseSucceed(() => []),
  )
}

export const pruneOrphans = (sql: SqlClient.SqlClient) =>
  sql`DELETE FROM search_index WHERE session_id NOT IN (SELECT id FROM sessions)`.pipe(
    Effect.asVoid,
  )
