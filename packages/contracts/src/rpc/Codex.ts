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
  /**
   * The active Codex account, the one new threads run as, and the models it
   * offers. Never fails: a Codex that cannot start is reported as
   * `Unavailable`, with the reason. The result is cached briefly;
   * `refresh: true` checks again right away.
   */
  Rpc.make("Codex.status", {
    payload: { refresh: Schema.Boolean },
    success: CodexStatus,
  }),
  /** Every account, the default one first. `refresh: true` checks each of them again. */
  Rpc.make("Codex.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(CodexAccount),
  }),
  /**
   * Adds an account. Without `configDir` it gets a new, signed-out Codex
   * folder of its own and the human signs in to it next. With it, the account
   * runs on that existing folder (`~` is the daemon's home directory), which
   * Humanity never creates, changes or deletes.
   */
  Rpc.make("Codex.addAccount", {
    payload: { name: Schema.String, configDir: Schema.optional(Schema.String) },
    success: CodexAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  /** Removes an added account and its login. Refused while an open thread runs as it. */
  Rpc.make("Codex.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  /** Makes new threads run as this account. Existing threads keep the account they started with. */
  Rpc.make("Codex.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: AccountNotFound,
  }),
)
