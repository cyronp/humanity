import { Schema } from "effect"

export const PROTOCOL_VERSION = 1

const nullable = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema))

export const InitializeResponse = Schema.Struct({
  protocolVersion: nullable(Schema.Number),
  agentCapabilities: nullable(
    Schema.Struct({
      loadSession: nullable(Schema.Boolean),
      promptCapabilities: nullable(Schema.Struct({ image: nullable(Schema.Boolean) })),
      mcpCapabilities: nullable(
        Schema.Struct({ http: nullable(Schema.Boolean), sse: nullable(Schema.Boolean) }),
      ),
      sessionCapabilities: nullable(Schema.Struct({ resume: Schema.optional(Schema.Unknown) })),
      _meta: Schema.optional(Schema.Unknown),
    }),
  ),
  agentInfo: nullable(Schema.Struct({ name: Schema.String, version: nullable(Schema.String) })),
})
export type InitializeResponse = typeof InitializeResponse.Type

export const ConfigOption = Schema.Struct({
  id: Schema.String,
  category: nullable(Schema.String),
  currentValue: Schema.Union([Schema.String, Schema.Boolean]),
  options: Schema.optional(Schema.Unknown),
})
export type ConfigOption = typeof ConfigOption.Type

export const ConfigOptions = Schema.Array(ConfigOption)

export const SessionModes = Schema.Struct({
  currentModeId: Schema.String,
  availableModes: Schema.Array(Schema.Struct({ id: Schema.String })),
})
export type SessionModes = typeof SessionModes.Type

export const SessionResponse = Schema.Struct({
  sessionId: nullable(Schema.String),
  configOptions: nullable(ConfigOptions),
  modes: nullable(SessionModes),
})

export const ModeUpdate = Schema.Struct({ currentModeId: Schema.String })

export const ContentBlock = Schema.Struct({
  type: Schema.String,
  text: nullable(Schema.String),
})

export const ToolCallContent = Schema.Struct({
  type: Schema.String,
  content: nullable(ContentBlock),
  path: nullable(Schema.String),
  oldText: nullable(Schema.String),
  newText: nullable(Schema.String),
})
export type ToolCallContent = typeof ToolCallContent.Type

export const ToolCallFields = Schema.Struct({
  toolCallId: Schema.String,
  title: nullable(Schema.String),
  name: nullable(Schema.String),
  kind: nullable(Schema.String),
  status: nullable(Schema.String),
  content: nullable(Schema.Array(ToolCallContent)),
  locations: nullable(Schema.Array(Schema.Struct({ path: Schema.String }))),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
  _meta: Schema.optional(Schema.Unknown),
})
export type ToolCallFields = typeof ToolCallFields.Type

export const SessionUpdate = Schema.Struct({
  sessionId: Schema.String,
  update: Schema.Struct({ sessionUpdate: Schema.String }),
})

export const ChunkUpdate = Schema.Struct({ content: ContentBlock })

export const UsageUpdate = Schema.Struct({ used: Schema.Number, size: Schema.Number })

export const ConfigOptionUpdate = Schema.Struct({ configOptions: ConfigOptions })

export const PermissionOption = Schema.Struct({
  optionId: Schema.String,
  name: nullable(Schema.String),
  kind: Schema.String,
})
export type PermissionOption = typeof PermissionOption.Type

export const PermissionRequest = Schema.Struct({
  sessionId: Schema.String,
  toolCall: ToolCallFields,
  options: Schema.Array(PermissionOption),
  _meta: Schema.optional(Schema.Unknown),
})

export const PromptResponse = Schema.Struct({
  stopReason: Schema.String,
  usage: nullable(
    Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      cachedReadTokens: nullable(Schema.Number),
      cachedWriteTokens: nullable(Schema.Number),
    }),
  ),
})
