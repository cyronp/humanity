import { Schema } from "effect"

export const AntigravityConnection = Schema.TaggedUnion({
  Connected: {
    label: Schema.String,
  },
  SignedOut: {},
  Unavailable: { reason: Schema.String },
})
export type AntigravityConnection = typeof AntigravityConnection.Type

export const AntigravityModel = Schema.Struct({
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
})
export type AntigravityModel = typeof AntigravityModel.Type

export const AntigravityStatus = Schema.Struct({
  connection: AntigravityConnection,
  models: Schema.Array(AntigravityModel),
  cliVersion: Schema.NullOr(Schema.String),
  geminiHome: Schema.NullOr(Schema.String),
  executable: Schema.String,
  checkedAt: Schema.String,
})
export type AntigravityStatus = typeof AntigravityStatus.Type

export const AntigravityAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  linkedFolder: Schema.Boolean,
  active: Schema.Boolean,
  status: AntigravityStatus,
})
export type AntigravityAccount = typeof AntigravityAccount.Type
