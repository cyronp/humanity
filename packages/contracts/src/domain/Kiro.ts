import { Schema } from "effect"

export const KiroConnection = Schema.TaggedUnion({
  Connected: {
    label: Schema.String,
  },
  SignedOut: {},
  Unavailable: { reason: Schema.String },
})
export type KiroConnection = typeof KiroConnection.Type

export const KiroModel = Schema.Struct({
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
})
export type KiroModel = typeof KiroModel.Type

export const KiroStatus = Schema.Struct({
  connection: KiroConnection,
  models: Schema.Array(KiroModel),
  cliVersion: Schema.NullOr(Schema.String),
  kiroHome: Schema.NullOr(Schema.String),
  executable: Schema.String,
  checkedAt: Schema.String,
})
export type KiroStatus = typeof KiroStatus.Type

export const KiroAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  linkedFolder: Schema.Boolean,
  active: Schema.Boolean,
  status: KiroStatus,
})
export type KiroAccount = typeof KiroAccount.Type
