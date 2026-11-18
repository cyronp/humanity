import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ClaudeAccount, ClaudeStatus } from "../domain/Claude.ts"
import {
  AccountFolderInvalid,
  AccountInUse,
  AccountNameInvalid,
  AccountNotFound,
} from "../Errors.ts"

export const ClaudeRpcs = RpcGroup.make(
  Rpc.make("Claude.status", {
    payload: { refresh: Schema.Boolean },
    success: ClaudeStatus,
  }),
  Rpc.make("Claude.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(ClaudeAccount),
  }),
  Rpc.make("Claude.addAccount", {
    payload: { name: Schema.String, configDir: Schema.optional(Schema.String) },
    success: ClaudeAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  Rpc.make("Claude.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  Rpc.make("Claude.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: AccountNotFound,
  }),
)
