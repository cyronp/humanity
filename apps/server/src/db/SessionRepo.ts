import {
  type Attachment,
  AttachmentKind,
  Autonomy,
  type ChatMessage,
  MessageContent,
  ProjectId,
  type Session,
  SessionId,
  SessionStatus,
  type ToolCall,
  ToolCallStatus,
  ToolResult,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

const SessionRow = Schema.Struct({
  id: SessionId,
  project_id: ProjectId,
  sdk_session_id: Schema.NullOr(Schema.String),
  title: Schema.String,
  branch: Schema.String,
  worktree_path: Schema.String,
  in_worktree: Schema.Number,
  model: Schema.NullOr(Schema.String),
  autonomy: Autonomy,
  status: SessionStatus,
  created_at: Schema.String,
  updated_at: Schema.String,
})

const toSession = (row: typeof SessionRow.Type): Session => ({
  id: row.id,
  projectId: row.project_id,
  sdkSessionId: row.sdk_session_id,
  title: row.title,
  branch: row.branch,
  worktreePath: row.worktree_path,
  inWorktree: row.in_worktree !== 0,
  model: row.model,
  autonomy: row.autonomy,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const AttachmentRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: AttachmentKind,
  media_type: Schema.String,
  size: Schema.Number,
})

const toAttachment = (row: typeof AttachmentRow.Type): Attachment => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  mediaType: row.media_type,
  size: row.size,
})

const MessageJson = Schema.fromJsonString(MessageContent)

const MessageRow = Schema.Struct({
  id: Schema.String,
  session_id: SessionId,
  normalized_json: MessageJson,
  created_at: Schema.String,
})

const ToolOutput = Schema.Struct({
  result: ToolResult,
  structured: Schema.optional(Schema.Unknown),
})
const ToolOutputJson = Schema.fromJsonString(ToolOutput)
const UnknownJson = Schema.fromJsonString(Schema.Unknown)

const ToolCallRow = Schema.Struct({
  id: Schema.String,
  session_id: SessionId,
  tool_use_id: Schema.String,
  tool_name: Schema.String,
  input_json: UnknownJson,
  output_json: Schema.NullOr(ToolOutputJson),
  status: ToolCallStatus,
  started_at: Schema.String,
  finished_at: Schema.NullOr(Schema.String),
})

const toToolCall = (row: typeof ToolCallRow.Type): ToolCall => ({
  id: row.id,
  sessionId: row.session_id,
  toolUseId: row.tool_use_id,
  toolName: row.tool_name,
  input: row.input_json,
  output: row.output_json?.result ?? null,
  ...(row.output_json?.structured === undefined
    ? {}
    : { structuredOutput: row.output_json.structured }),
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
})

/** JSON text for a value that may not be serializable (the SDK's raw messages). */
const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? "null"
  } catch {
    return JSON.stringify({ unserializable: String(value) })
  }
}

/** Persistence for sessions, their messages and tool calls. Rows are decoded with Schema. */
export class SessionRepo extends Context.Service<
  SessionRepo,
  {
    readonly insert: (session: Session) => Effect.Effect<void>
    readonly get: (sessionId: string) => Effect.Effect<Option.Option<Session>>
    readonly listByProject: (projectId: string) => Effect.Effect<ReadonlyArray<Session>>
    /** Every session of every project, most recently active first. */
    readonly listAll: Effect.Effect<ReadonlyArray<Session>>
    readonly listByStatus: (
      statuses: ReadonlyArray<SessionStatus>,
    ) => Effect.Effect<ReadonlyArray<Session>>
    readonly update: (
      sessionId: string,
      changes: {
        readonly status?: SessionStatus
        readonly sdkSessionId?: string
        readonly autonomy?: Autonomy
        /** `null` stores Claude Code's default. */
        readonly model?: string | null
        /** Set together when the session moves into its own worktree. */
        readonly worktree?: { readonly branch: string; readonly path: string }
        readonly updatedAt: string
      },
    ) => Effect.Effect<void>
    readonly insertMessage: (message: ChatMessage, raw: unknown) => Effect.Effect<void>
    readonly listMessages: (sessionId: string) => Effect.Effect<ReadonlyArray<ChatMessage>>
    readonly insertToolCall: (toolCall: ToolCall) => Effect.Effect<void>
    readonly finishToolCall: (
      sessionId: string,
      toolUseId: string,
      changes: {
        readonly status: ToolCallStatus
        readonly output: ToolResult
        readonly structuredOutput: unknown
        readonly finishedAt: string
      },
    ) => Effect.Effect<Option.Option<ToolCall>>
    readonly getToolCall: (
      sessionId: string,
      toolUseId: string,
    ) => Effect.Effect<Option.Option<ToolCall>>
    readonly listToolCalls: (sessionId: string) => Effect.Effect<ReadonlyArray<ToolCall>>
    readonly insertAttachment: (
      sessionId: string,
      attachment: Attachment,
      createdAt: string,
    ) => Effect.Effect<void>
    readonly getAttachment: (
      sessionId: string,
      attachmentId: string,
    ) => Effect.Effect<Option.Option<Attachment>>
  }
>()("humanity/SessionRepo") {
  static readonly layer = Layer.effect(
    SessionRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findSession = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: SessionRow,
        execute: (id) => sql`SELECT * FROM sessions WHERE id = ${id}`,
      })
      const findByProject = SqlSchema.findAll({
        Request: Schema.String,
        Result: SessionRow,
        execute: (projectId) =>
          sql`SELECT * FROM sessions WHERE project_id = ${projectId} ORDER BY created_at DESC, rowid DESC`,
      })
      const findAll = SqlSchema.findAll({
        Request: Schema.Void,
        Result: SessionRow,
        execute: () => sql`SELECT * FROM sessions ORDER BY updated_at DESC, rowid DESC`,
      })
      const findByStatus = SqlSchema.findAll({
        Request: Schema.Array(Schema.String),
        Result: SessionRow,
        execute: (statuses) => sql`SELECT * FROM sessions WHERE ${sql.in("status", statuses)}`,
      })
      const findMessages = SqlSchema.findAll({
        Request: Schema.String,
        Result: MessageRow,
        execute: (sessionId) =>
          sql`SELECT id, session_id, normalized_json, created_at FROM messages WHERE session_id = ${sessionId} ORDER BY rowid`,
      })
      const findToolCalls = SqlSchema.findAll({
        Request: Schema.String,
        Result: ToolCallRow,
        execute: (sessionId) =>
          sql`SELECT * FROM tool_calls WHERE session_id = ${sessionId} ORDER BY rowid`,
      })
      const findToolCall = SqlSchema.findOneOption({
        Request: Schema.Struct({ sessionId: Schema.String, toolUseId: Schema.String }),
        Result: ToolCallRow,
        execute: ({ sessionId, toolUseId }) =>
          sql`SELECT * FROM tool_calls WHERE session_id = ${sessionId} AND tool_use_id = ${toolUseId}`,
      })
      const encodeMessage = Schema.encodeEffect(MessageJson)
      const encodeOutput = Schema.encodeEffect(ToolOutputJson)

      const insert = (session: Session) =>
        sql`
          INSERT INTO sessions ${sql.insert({
            id: session.id,
            project_id: session.projectId,
            sdk_session_id: session.sdkSessionId,
            title: session.title,
            branch: session.branch,
            worktree_path: session.worktreePath,
            in_worktree: session.inWorktree ? 1 : 0,
            model: session.model,
            autonomy: session.autonomy,
            status: session.status,
            created_at: session.createdAt,
            updated_at: session.updatedAt,
          })}
        `.pipe(Effect.asVoid, Effect.orDie)

      const get = (sessionId: string) =>
        findSession(sessionId).pipe(Effect.map(Option.map(toSession)), Effect.orDie)

      const listByProject = (projectId: string) =>
        findByProject(projectId).pipe(
          Effect.map((rows) => rows.map(toSession)),
          Effect.orDie,
        )

      const listAll = findAll().pipe(
        Effect.map((rows) => rows.map(toSession)),
        Effect.orDie,
      )

      const listByStatus = (statuses: ReadonlyArray<SessionStatus>) =>
        statuses.length === 0
          ? Effect.succeed([])
          : findByStatus(statuses).pipe(
              Effect.map((rows) => rows.map(toSession)),
              Effect.orDie,
            )

      const update = (
        sessionId: string,
        changes: {
          readonly status?: SessionStatus
          readonly sdkSessionId?: string
          readonly autonomy?: Autonomy
          readonly model?: string | null
          readonly worktree?: { readonly branch: string; readonly path: string }
          readonly updatedAt: string
        },
      ) =>
        sql`
          UPDATE sessions SET ${sql.update({
            updated_at: changes.updatedAt,
            ...(changes.status === undefined ? {} : { status: changes.status }),
            ...(changes.sdkSessionId === undefined ? {} : { sdk_session_id: changes.sdkSessionId }),
            ...(changes.autonomy === undefined ? {} : { autonomy: changes.autonomy }),
            ...(changes.model === undefined ? {} : { model: changes.model }),
            ...(changes.worktree === undefined
              ? {}
              : {
                  branch: changes.worktree.branch,
                  worktree_path: changes.worktree.path,
                  in_worktree: 1,
                }),
          })}
          WHERE id = ${sessionId}
        `.pipe(Effect.asVoid, Effect.orDie)

      const findAttachment = SqlSchema.findOneOption({
        Request: Schema.Struct({ sessionId: Schema.String, attachmentId: Schema.String }),
        Result: AttachmentRow,
        execute: ({ sessionId, attachmentId }) =>
          sql`SELECT id, name, kind, media_type, size FROM attachments WHERE id = ${attachmentId} AND session_id = ${sessionId}`,
      })

      const insertAttachment = (sessionId: string, attachment: Attachment, createdAt: string) =>
        sql`
          INSERT INTO attachments ${sql.insert({
            id: attachment.id,
            session_id: sessionId,
            name: attachment.name,
            kind: attachment.kind,
            media_type: attachment.mediaType,
            size: attachment.size,
            created_at: createdAt,
          })}
        `.pipe(Effect.asVoid, Effect.orDie)

      const getAttachment = (sessionId: string, attachmentId: string) =>
        findAttachment({ sessionId, attachmentId }).pipe(
          Effect.map(Option.map(toAttachment)),
          Effect.orDie,
        )

      const insertMessage = (message: ChatMessage, raw: unknown) =>
        Effect.gen(function* () {
          const normalized = yield* encodeMessage(message.content)
          yield* sql`
            INSERT INTO messages ${sql.insert({
              id: message.id,
              session_id: message.sessionId,
              role: message.content._tag,
              normalized_json: normalized,
              raw_json: raw === undefined ? null : safeJson(raw),
              created_at: message.createdAt,
            })}
          `
        }).pipe(Effect.orDie)

      const listMessages = (sessionId: string) =>
        findMessages(sessionId).pipe(
          Effect.map((rows) =>
            rows.map((row): ChatMessage => ({
              id: row.id,
              sessionId: row.session_id,
              content: row.normalized_json,
              createdAt: row.created_at,
            })),
          ),
          Effect.orDie,
        )

      const insertToolCall = (toolCall: ToolCall) =>
        sql`
          INSERT INTO tool_calls ${sql.insert({
            id: toolCall.id,
            session_id: toolCall.sessionId,
            tool_use_id: toolCall.toolUseId,
            tool_name: toolCall.toolName,
            input_json: safeJson(toolCall.input),
            output_json: null,
            status: toolCall.status,
            started_at: toolCall.startedAt,
            finished_at: null,
          })}
          ON CONFLICT (session_id, tool_use_id) DO NOTHING
        `.pipe(Effect.asVoid, Effect.orDie)

      const getToolCall = (sessionId: string, toolUseId: string) =>
        findToolCall({ sessionId, toolUseId }).pipe(
          Effect.map(Option.map(toToolCall)),
          Effect.orDie,
        )

      const finishToolCall = (
        sessionId: string,
        toolUseId: string,
        changes: {
          readonly status: ToolCallStatus
          readonly output: ToolResult
          readonly structuredOutput: unknown
          readonly finishedAt: string
        },
      ) =>
        Effect.gen(function* () {
          const output = yield* encodeOutput({
            result: changes.output,
            ...(changes.structuredOutput === undefined
              ? {}
              : { structured: changes.structuredOutput }),
          }).pipe(
            // A structured output that does not serialize must not lose the result itself.
            Effect.catch(() => encodeOutput({ result: changes.output })),
          )
          yield* sql`
            UPDATE tool_calls SET ${sql.update({
              status: changes.status,
              output_json: output,
              finished_at: changes.finishedAt,
            })}
            WHERE session_id = ${sessionId} AND tool_use_id = ${toolUseId}
          `
          return yield* getToolCall(sessionId, toolUseId)
        }).pipe(Effect.orDie)

      const listToolCalls = (sessionId: string) =>
        findToolCalls(sessionId).pipe(
          Effect.map((rows) => rows.map(toToolCall)),
          Effect.orDie,
        )

      return SessionRepo.of({
        insert,
        get,
        listByProject,
        listAll,
        listByStatus,
        update,
        insertMessage,
        listMessages,
        insertToolCall,
        finishToolCall,
        getToolCall,
        listToolCalls,
        insertAttachment,
        getAttachment,
      })
    }),
  )
}
