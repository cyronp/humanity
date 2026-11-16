import { type Option, Schema } from "effect"

/**
 * The parts of the Agent Client Protocol (version 1) Humanity reads. Only the
 * fields Humanity uses are described; everything else in a message is ignored.
 * https://agentclientprotocol.com
 */

/** The protocol version Humanity speaks. */
export const PROTOCOL_VERSION = 1

const nullable = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema))

export const InitializeResponse = Schema.Struct({
  agentCapabilities: nullable(
    Schema.Struct({
      loadSession: nullable(Schema.Boolean),
      promptCapabilities: nullable(Schema.Struct({ image: nullable(Schema.Boolean) })),
      mcpCapabilities: nullable(
        Schema.Struct({ http: nullable(Schema.Boolean), sse: nullable(Schema.Boolean) }),
      ),
      /** `resume` is an object when the agent can reopen a session without replaying it. */
      sessionCapabilities: nullable(Schema.Struct({ resume: Schema.optional(Schema.Unknown) })),
    }),
  ),
  agentInfo: nullable(Schema.Struct({ name: Schema.String, version: nullable(Schema.String) })),
})
export type InitializeResponse = typeof InitializeResponse.Type

/** A setting of a session the agent lets the client change: its model, its reasoning effort. */
export const ConfigOption = Schema.Struct({
  id: Schema.String,
  category: nullable(Schema.String),
  currentValue: Schema.Union([Schema.String, Schema.Boolean]),
})
export type ConfigOption = typeof ConfigOption.Type

export const ConfigOptions = Schema.Array(ConfigOption)

/** The answer to `session/new`, and to `session/load` and `session/resume`, which name no session. */
export const SessionResponse = Schema.Struct({
  sessionId: nullable(Schema.String),
  configOptions: nullable(ConfigOptions),
})

export const ContentBlock = Schema.Struct({
  type: Schema.String,
  text: nullable(Schema.String),
})

export const ToolCallContent = Schema.Struct({
  type: Schema.String,
  /** On `content`: what the tool produced. */
  content: nullable(ContentBlock),
  /** On `diff`: the file and its text before and after. No text before means a new file. */
  path: nullable(Schema.String),
  oldText: nullable(Schema.String),
  newText: nullable(Schema.String),
})
export type ToolCallContent = typeof ToolCallContent.Type

/** A tool call as the agent announces it, updates it, and asks permission for it. */
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

/** `session/update`: what the agent reports while it works. */
export const SessionUpdate = Schema.Struct({
  sessionId: Schema.String,
  update: Schema.Struct({ sessionUpdate: Schema.String }),
})

/** `agent_message_chunk` and `agent_thought_chunk`. */
export const ChunkUpdate = Schema.Struct({ content: ContentBlock })

/** `usage_update`: how full the context window is. */
export const UsageUpdate = Schema.Struct({ used: Schema.Number, size: Schema.Number })

/** `config_option_update`: every option again, as it now stands. */
export const ConfigOptionUpdate = Schema.Struct({ configOptions: ConfigOptions })

export const PermissionOption = Schema.Struct({
  optionId: Schema.String,
  /** `allow_once`, `allow_always`, `reject_once` or `reject_always`. */
  kind: Schema.String,
})
export type PermissionOption = typeof PermissionOption.Type

/** `session/request_permission`: the agent asks before it runs a tool. */
export const PermissionRequest = Schema.Struct({
  sessionId: Schema.String,
  toolCall: ToolCallFields,
  options: Schema.Array(PermissionOption),
})

/** The answer to `session/prompt`: the turn is over. */
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

export const decode =
  <S extends Schema.Constraint>(schema: S) =>
  (input: unknown): Option.Option<S["Type"]> =>
    Schema.decodeUnknownOption(schema as never)(input) as Option.Option<S["Type"]>
