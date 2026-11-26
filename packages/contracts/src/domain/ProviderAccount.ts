import { Schema } from "effect"
import { ModelEfforts } from "./Session.ts"

export const ProviderAuthMethod = Schema.Literals(["plan", "apiKey", "cloudProvider"])
export type ProviderAuthMethod = typeof ProviderAuthMethod.Type

export const ProviderConnection = Schema.TaggedUnion({
  Connected: {
    method: ProviderAuthMethod,
    label: Schema.String,
    email: Schema.NullOr(Schema.String),
    organization: Schema.NullOr(Schema.String),
    subscriptionShadowed: Schema.Boolean,
  },
  SignedOut: {},
  Unavailable: { reason: Schema.String },
})
export type ProviderConnection = typeof ProviderConnection.Type

export const ProviderModel = Schema.Struct({
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  efforts: ModelEfforts,
  isDefault: Schema.optional(Schema.Boolean),
})
export type ProviderModel = typeof ProviderModel.Type

export const ProviderStatus = Schema.Struct({
  connection: ProviderConnection,
  models: Schema.Array(ProviderModel),
  cliVersion: Schema.NullOr(Schema.String),
  home: Schema.NullOr(Schema.String),
  executable: Schema.NullOr(Schema.String),
  checkedAt: Schema.String,
})
export type ProviderStatus = typeof ProviderStatus.Type

export const ProviderAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  linkedFolder: Schema.Boolean,
  active: Schema.Boolean,
  status: ProviderStatus,
})
export type ProviderAccount = typeof ProviderAccount.Type

export const planConnection = (label: string): ProviderConnection => ({
  _tag: "Connected",
  method: "plan",
  label,
  email: null,
  organization: null,
  subscriptionShadowed: false,
})
