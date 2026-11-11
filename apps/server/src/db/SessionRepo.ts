import {
  type Attachment,
  AttachmentKind,
  Autonomy,
  type ChatMessage,
  MessageContent,
  NO_USAGE,
  ProjectId,
  ReasoningEffort,
  type Session,
  SessionId,
  SessionOrigin,
  SessionStatus,
  SessionUsage,
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
  effort: Schema.NullOr(ReasoningEffort),
  autonomy: Autonomy,
  status: SessionStatus,
  origin: SessionOrigin,
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
  effort: row.effort,
  autonomy: row.autonomy,
  status: row.status,
  origin: row.origin,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const UsageJson = Schema.fromJsonString(SessionUsage)
const UsageRow = Schema.Struct({ usage_json: Schema.NullOr(Schema.String) })

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

export interface ImportIndex {
  /** Imported threads by the Claude Code session they came from. */
  readonly bySource: ReadonlyMap<
    string,
    {
      readonly sessionId: SessionId
      /** The transcript's mtime at the last import; `null` once continued in Humanity. */
      readonly mtime: number | null
    }
  >
  /** Every Agent SDK session id a thread has, imported or not. */
  readonly sdkSessionIds: ReadonlySet<string>
}

export interface ImportedThreadRows {
  readonly session: Session
  /** The Claude Code session the thread came from. */
  readonly sourceId: string
  /** The transcript's mtime, in milliseconds. */
  readonly mtime: number
  readonly messages: ReadonlyArray<{ readonly message: ChatMessage; readonly raw: unknown }>
  readonly toolCalls: ReadonlyArray<ToolCall>
}

const ImportIndexRow = Schema.Struct({
  id: SessionId,
  sdk_session_id: Schema.NullOr(Schema.String),
  import_source_id: Schema.NullOr(Schema.String),
  import_mtime: Schema.NullOr(Schema.Number),
})

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
        /** `null` stores the model's default effort. */
        readonly effort?: ReasoningEffort | null
        /** Set together when the session moves into its own worktree. */
        readonly worktree?: { readonly branch: string; readonly path: string }
        /** Stops refreshing an imported thread from its Claude Code transcript. */
        readonly detachImport?: true
        readonly updatedAt: string
      },
    ) => Effect.Effect<void>
    /**
     * Which Claude Code conversations Humanity already knows: the imported
     * ones by the session they came from, and every `sdk_session_id`.
     */
    readonly importIndex: Effect.Effect<ImportIndex>
    /**
     * Writes an imported thread with its whole transcript, replacing what an
     * earlier import of the same thread stored. One transaction, so a thread
     * is never seen half imported. `false` when the thread was continued in
     * Humanity meanwhile, and nothing was written.
     */
    readonly writeImported: (imported: ImportedThreadRows) => Effect.Effect<boolean>
    /** The limits the session last heard about; all `null` until the agent reports them. */
    readonly getUsage: (sessionId: string) => Effect.Effect<SessionUsage>
    readonly setUsage: (sessionId: string, usage: SessionUsage) => Effect.Effect<void>
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
            effort: session.effort,
            autonomy: session.autonomy,
            status: session.status,
            origin: session.origin,
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
          readonly effort?: ReasoningEffort | null
          readonly worktree?: { readonly branch: string; readonly path: string }
          readonly detachImport?: true
          readonly updatedAt: string
        },
      ) =>
        sql`
          UPDATE sessions SET ${sql.update({
            updated_at: changes.updatedAt,
            ...(changes.detachImport === undefined ? {} : { import_mtime: null }),
            ...(changes.status === undefined ? {} : { status: changes.status }),
            ...(changes.sdkSessionId === undefined ? {} : { sdk_session_id: changes.sdkSessionId }),
            ...(changes.autonomy === undefined ? {} : { autonomy: changes.autonomy }),
            ...(changes.model === undefined ? {} : { model: changes.model }),
            ...(changes.effort === undefined ? {} : { effort: changes.effort }),
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

      const findUsage = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: UsageRow,
        execute: (id) => sql`SELECT usage_json FROM sessions WHERE id = ${id}`,
      })
      const decodeUsage = Schema.decodeUnknownOption(UsageJson)
      const encodeUsage = Schema.encodeEffect(UsageJson)

      const getUsage = (sessionId: string) =>
        findUsage(sessionId).pipe(
          Effect.map((row) =>
            row.pipe(
              // A value written by another version of Humanity reads as "nothing reported yet".
              Option.flatMap(({ usage_json }) => decodeUsage(usage_json)),
              Option.getOrElse(() => NO_USAGE),
            ),
          ),
          Effect.orDie,
        )

      const setUsage = (sessionId: string, usage: SessionUsage) =>
        Effect.gen(function* () {
          const json = yield* encodeUsage(usage)
          yield* sql`UPDATE sessions SET usage_json = ${json} WHERE id = ${sessionId}`
        }).pipe(Effect.orDie)

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

      const findImportIndex = SqlSchema.findAll({
        Request: Schema.Void,
        Result: ImportIndexRow,
        execute: () => sql`SELECT id, sdk_session_id, import_source_id, import_mtime FROM sessions`,
      })

      const importIndex = findImportIndex().pipe(
        Effect.map((rows): ImportIndex => {
          const bySource = new Map<string, { sessionId: SessionId; mtime: number | null }>()
          const sdkSessionIds = new Set<string>()
          for (const row of rows) {
            if (row.sdk_session_id !== null) sdkSessionIds.add(row.sdk_session_id)
            if (row.import_source_id !== null) {
              bySource.set(row.import_source_id, { sessionId: row.id, mtime: row.import_mtime })
            }
          }
          return { bySource, sdkSessionIds }
        }),
        Effect.orDie,
      )

      const findImportMtime = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: Schema.Struct({ import_mtime: Schema.NullOr(Schema.Number) }),
        execute: (id) => sql`SELECT import_mtime FROM sessions WHERE id = ${id}`,
      })

      const writeImported = ({
        session,
        sourceId,
        mtime,
        messages,
        toolCalls,
      }: ImportedThreadRows) =>
        Effect.gen(function* () {
          // Continued in Humanity since the import was planned: its messages are the human's now.
          const existing = yield* findImportMtime(session.id)
          if (Option.isSome(existing) && existing.value.import_mtime === null) return false
          yield* sql`
            INSERT INTO sessions ${sql.insert({
              id: session.id,
              project_id: session.projectId,
              sdk_session_id: session.sdkSessionId,
              title: session.title,
              branch: session.branch,
              worktree_path: session.worktreePath,
              in_worktree: session.inWorktree ? 1 : 0,
              model: session.model,
              effort: session.effort,
              autonomy: session.autonomy,
              status: session.status,
              origin: session.origin,
              import_source_id: sourceId,
              import_mtime: mtime,
              created_at: session.createdAt,
              updated_at: session.updatedAt,
            })}
            ON CONFLICT (id) DO UPDATE SET
              title = excluded.title,
              branch = excluded.branch,
              import_mtime = excluded.import_mtime,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `
          yield* sql`DELETE FROM messages WHERE session_id = ${session.id}`
          yield* sql`DELETE FROM tool_calls WHERE session_id = ${session.id}`
          for (const { message, raw } of messages) yield* insertMessage(message, raw)
          for (const toolCall of toolCalls) {
            const output =
              toolCall.output === null ? null : yield* encodeOutput({ result: toolCall.output })
            yield* sql`
              INSERT INTO tool_calls ${sql.insert({
                id: toolCall.id,
                session_id: toolCall.sessionId,
                tool_use_id: toolCall.toolUseId,
                tool_name: toolCall.toolName,
                input_json: safeJson(toolCall.input),
                output_json: output,
                status: toolCall.status,
                started_at: toolCall.startedAt,
                finished_at: toolCall.finishedAt,
              })}
              ON CONFLICT (session_id, tool_use_id) DO NOTHING
            `
          }
          return true
        }).pipe(sql.withTransaction, Effect.orDie)

      return SessionRepo.of({
        insert,
        get,
        listByProject,
        listAll,
        listByStatus,
        update,
        importIndex,
        writeImported,
        getUsage,
        setUsage,
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
