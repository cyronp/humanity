import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AntigravityAccount, AntigravityStatus } from "../domain/Antigravity.ts"
import {
  AccountFolderInvalid,
  AccountInUse,
  AccountNameInvalid,
  AccountNotFound,
} from "../Errors.ts"

export const AntigravityRpcs = RpcGroup.make(
  Rpc.make("Antigravity.status", {
    payload: { refresh: Schema.Boolean },
    success: AntigravityStatus,
  }),
  Rpc.make("Antigravity.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(AntigravityAccount),
  }),
  Rpc.make("Antigravity.addAccount", {
    payload: { name: Schema.String, configDir: Schema.optional(Schema.String) },
    success: AntigravityAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  Rpc.make("Antigravity.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  Rpc.make("Antigravity.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: AccountNotFound,
  }),
)
