import { Schema } from "effect"
import { DEFAULT_ACCOUNT } from "./Provider.ts"

export const ClaudeAuthMethod = Schema.Literals(["subscription", "apiKey", "cloudProvider"])
export type ClaudeAuthMethod = typeof ClaudeAuthMethod.Type

export const ClaudeConnection = Schema.TaggedUnion({
  Connected: {
    method: ClaudeAuthMethod,
    label: Schema.String,
    email: Schema.NullOr(Schema.String),
    organization: Schema.NullOr(Schema.String),
    subscriptionShadowed: Schema.Boolean,
  },
  SignedOut: {},
  Unavailable: { reason: Schema.String },
})
export type ClaudeConnection = typeof ClaudeConnection.Type

export const ClaudeModel = Schema.Struct({
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
})
export type ClaudeModel = typeof ClaudeModel.Type

export const ClaudeStatus = Schema.Struct({
  connection: ClaudeConnection,
  models: Schema.Array(ClaudeModel),
  cliVersion: Schema.NullOr(Schema.String),
  configDir: Schema.String,
  checkedAt: Schema.String,
})
export type ClaudeStatus = typeof ClaudeStatus.Type

export const DEFAULT_CLAUDE_ACCOUNT = DEFAULT_ACCOUNT

export const ClaudeAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  linkedFolder: Schema.Boolean,
  active: Schema.Boolean,
  status: ClaudeStatus,
})
export type ClaudeAccount = typeof ClaudeAccount.Type
