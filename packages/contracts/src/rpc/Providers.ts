import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AgentProvider } from "../domain/Provider.ts"
import { ProviderAccount, ProviderStatus } from "../domain/ProviderAccount.ts"
import {
  AccountFolderInvalid,
  AccountInUse,
  AccountNameInvalid,
  AccountNotFound,
} from "../Errors.ts"

export const ProvidersRpcs = RpcGroup.make(
  Rpc.make("Providers.status", {
    payload: { provider: AgentProvider, refresh: Schema.Boolean },
    success: ProviderStatus,
  }),
  Rpc.make("Providers.accounts", {
    payload: { provider: AgentProvider, refresh: Schema.Boolean },
    success: Schema.Array(ProviderAccount),
  }),
  Rpc.make("Providers.addAccount", {
    payload: {
      provider: AgentProvider,
      name: Schema.String,
      configDir: Schema.optional(Schema.String),
    },
    success: ProviderAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  Rpc.make("Providers.removeAccount", {
    payload: { provider: AgentProvider, accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  Rpc.make("Providers.setActiveAccount", {
    payload: { provider: AgentProvider, accountId: Schema.String },
    error: AccountNotFound,
  }),
)
