import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { CodexAccount, CodexStatus } from "../domain/Codex.ts"
import {
  AccountFolderInvalid,
  AccountInUse,
  AccountNameInvalid,
  AccountNotFound,
} from "../Errors.ts"

export const CodexRpcs = RpcGroup.make(
  Rpc.make("Codex.status", {
    payload: { refresh: Schema.Boolean },
    success: CodexStatus,
  }),
  Rpc.make("Codex.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(CodexAccount),
  }),
  Rpc.make("Codex.addAccount", {
    payload: { name: Schema.String, configDir: Schema.optional(Schema.String) },
    success: CodexAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  Rpc.make("Codex.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  Rpc.make("Codex.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: AccountNotFound,
  }),
)
