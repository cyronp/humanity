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
  /**
   * The active Kiro account, the one new threads run as, and the models it
   * offers. Never fails: a Kiro that cannot start is reported as `Unavailable`,
   * with the reason. The result is cached briefly; `refresh: true` checks again.
   */
  Rpc.make("Kiro.status", {
    payload: { refresh: Schema.Boolean },
    success: KiroStatus,
  }),
  /** Every account, the default one first. `refresh: true` checks each of them again. */
  Rpc.make("Kiro.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(KiroAccount),
  }),
  /**
   * Adds an account. Without `configDir` it gets a new, signed-out Kiro folder
   * of its own. With it, the account runs on that existing folder (`~` is the
   * daemon's home directory), which Humanity never creates, changes or deletes.
   */
  Rpc.make("Kiro.addAccount", {
    payload: { name: Schema.String, configDir: Schema.optional(Schema.String) },
    success: KiroAccount,
    error: Schema.Union([AccountNameInvalid, AccountFolderInvalid]),
  }),
  /** Removes an added account and its login. Refused while an open thread runs as it. */
  Rpc.make("Kiro.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([AccountNotFound, AccountInUse]),
  }),
  /** Makes new threads run as this account. Existing threads keep the account they started with. */
  Rpc.make("Kiro.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: AccountNotFound,
  }),
)
