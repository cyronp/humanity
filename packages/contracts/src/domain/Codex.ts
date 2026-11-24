import { Schema } from "effect"
import { ModelEfforts } from "./Session.ts"

export const CodexAuthMethod = Schema.Literals(["chatgpt", "apiKey", "cloudProvider"])
export type CodexAuthMethod = typeof CodexAuthMethod.Type

export const CodexConnection = Schema.TaggedUnion({
  Connected: {
    method: CodexAuthMethod,
    label: Schema.String,
    email: Schema.NullOr(Schema.String),
  },
  SignedOut: {},
  Unavailable: { reason: Schema.String },
})
export type CodexConnection = typeof CodexConnection.Type

export const CodexModel = Schema.Struct({
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  efforts: ModelEfforts,
  isDefault: Schema.Boolean,
})
export type CodexModel = typeof CodexModel.Type

export const CodexStatus = Schema.Struct({
  connection: CodexConnection,
  models: Schema.Array(CodexModel),
  cliVersion: Schema.NullOr(Schema.String),
  codexHome: Schema.NullOr(Schema.String),
  executable: Schema.String,
  checkedAt: Schema.String,
})
export type CodexStatus = typeof CodexStatus.Type

export const CodexAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  linkedFolder: Schema.Boolean,
  active: Schema.Boolean,
  status: CodexStatus,
})
export type CodexAccount = typeof CodexAccount.Type
