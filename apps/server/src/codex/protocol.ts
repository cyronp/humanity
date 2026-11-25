import { type Option, Schema } from "effect"

const nullable = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema))

export const InitializeResponse = Schema.Struct({
  userAgent: Schema.String,
  codexHome: nullable(Schema.String),
})

export const AccountResponse = Schema.Struct({
  account: Schema.NullOr(
    Schema.Struct({
      type: Schema.String,
      email: nullable(Schema.String),
      planType: nullable(Schema.String),
    }),
  ),
})
export type AccountResponse = typeof AccountResponse.Type

export const ModelListResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      model: Schema.String,
      displayName: Schema.String,
      description: Schema.optional(Schema.String),
      hidden: Schema.optional(Schema.Boolean),
      isDefault: Schema.optional(Schema.Boolean),
      supportedReasoningEfforts: nullable(
        Schema.Array(Schema.Struct({ reasoningEffort: Schema.String })),
      ),
    }),
  ),
  nextCursor: nullable(Schema.String),
})
export type ModelListResponse = typeof ModelListResponse.Type

const RateLimitWindow = Schema.Struct({
  usedPercent: Schema.Number,
  windowDurationMins: nullable(Schema.Number),
  resetsAt: nullable(Schema.Number),
})
export type RateLimitWindow = typeof RateLimitWindow.Type

export const RateLimitsResponse = Schema.Struct({
  rateLimits: Schema.Struct({
    primary: nullable(RateLimitWindow),
    secondary: nullable(RateLimitWindow),
  }),
})
export type RateLimitsResponse = typeof RateLimitsResponse.Type

export const ThreadResponse = Schema.Struct({
  thread: Schema.Struct({ id: Schema.String }),
  model: Schema.String,
})

export const TurnResponse = Schema.Struct({ turn: Schema.Struct({ id: Schema.String }) })

export const ConfigResponse = Schema.Struct({
  config: Schema.Struct({
    mcp_servers: nullable(Schema.Record(Schema.String, Schema.Unknown)),
  }),
})

const TokenBreakdown = Schema.Struct({
  totalTokens: Schema.Number,
  inputTokens: Schema.Number,
  cachedInputTokens: Schema.Number,
  cacheWriteInputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.Number,
})
export type TokenBreakdown = typeof TokenBreakdown.Type

export const TokenUsageUpdated = Schema.Struct({
  tokenUsage: Schema.Struct({
    total: TokenBreakdown,
    last: TokenBreakdown,
    modelContextWindow: nullable(Schema.Number),
  }),
})

export const PatchChange = Schema.Struct({
  path: Schema.String,
  kind: Schema.Struct({ type: Schema.String, move_path: nullable(Schema.String) }),
  diff: Schema.String,
})

export const ThreadItem = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  text: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.Array(Schema.String)),
  command: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  aggregatedOutput: nullable(Schema.String),
  exitCode: nullable(Schema.Number),
  changes: Schema.optional(Schema.Array(PatchChange)),
  server: Schema.optional(Schema.String),
  tool: Schema.optional(Schema.String),
  arguments: Schema.optional(Schema.Unknown),
  result: nullable(Schema.Struct({ content: Schema.Array(Schema.Unknown) })),
  error: nullable(Schema.Struct({ message: Schema.String })),
  query: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
})
export type ThreadItem = typeof ThreadItem.Type

export const ItemNotification = Schema.Struct({ item: ThreadItem })

export const AgentMessageDelta = Schema.Struct({ delta: Schema.String })

export const TurnCompleted = Schema.Struct({
  turn: Schema.Struct({
    id: Schema.String,
    status: Schema.String,
    error: nullable(Schema.Struct({ message: Schema.String })),
    durationMs: nullable(Schema.Number),
  }),
})

export const ApprovalRequest = Schema.Struct({
  itemId: Schema.String,
  reason: nullable(Schema.String),
  command: nullable(Schema.String),
  cwd: nullable(Schema.String),
})

export const UserInputRequest = Schema.Struct({
  itemId: Schema.String,
  questions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      header: Schema.String,
      question: Schema.String,
      options: nullable(
        Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String })),
      ),
    }),
  ),
})

export const ElicitationRequest = Schema.Struct({
  serverName: Schema.String,
  mode: Schema.String,
  message: Schema.optional(Schema.String),
  requestedSchema: Schema.optional(Schema.Unknown),
})

export const decode =
  <S extends Schema.Constraint>(schema: S) =>
  (input: unknown): Option.Option<S["Type"]> =>
    Schema.decodeUnknownOption(schema as never)(input) as Option.Option<S["Type"]>
