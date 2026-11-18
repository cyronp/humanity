import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { KiroAccount, KiroStatus } from "../domain/Kiro.ts"
import {
  AccountFolderInvalid,
  AccountInUse,
  AccountNameInvalid,
  AccountNotFound,
} from "../Errors.ts"

export const KiroRpcs = RpcGroup.make(
  Rpc.make("Kiro.status", {
    payload: { refresh: Schema.Boolean },
    success: KiroStatus,
  }),
  Rpc.make("Kiro.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(KiroAccount),
  }),
  Rpc.make("Kiro.addAccount", {
    payload: { name: Schema.String, configDir: Schema.optional(Schema.String) },
    success: KiroAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  Rpc.make("Kiro.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  Rpc.make("Kiro.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: AccountNotFound,
  }),
)
