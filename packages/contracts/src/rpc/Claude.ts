import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ClaudeAccount, ClaudeStatus } from "../domain/Claude.ts"
import { ClaudeAccountInUse, ClaudeAccountNameInvalid, ClaudeAccountNotFound } from "../Errors.ts"

export const ClaudeRpcs = RpcGroup.make(
  /**
   * The active Claude account: the one new threads run as. Never fails: a
   * Claude Code that cannot start is reported as `Unavailable`, with the reason.
   * The result is cached briefly; `refresh: true` checks again right away.
   */
  Rpc.make("Claude.status", {
    payload: { refresh: Schema.Boolean },
    success: ClaudeStatus,
  }),
  /** Every account, the default one first. `refresh: true` checks each of them again. */
  Rpc.make("Claude.accounts", {
    payload: { refresh: Schema.Boolean },
    success: Schema.Array(ClaudeAccount),
  }),
  /** Adds a signed-out account with its own Claude Code config folder. The human signs in to it next. */
  Rpc.make("Claude.addAccount", {
    payload: { name: Schema.String },
    success: ClaudeAccount,
    error: ClaudeAccountNameInvalid,
  }),
  /** Removes an added account and its login. Refused while an open thread runs as it. */
  Rpc.make("Claude.removeAccount", {
    payload: { accountId: Schema.String },
    error: Schema.Union([ClaudeAccountNotFound, ClaudeAccountInUse]),
  }),
  /** Makes new threads run as this account. Existing threads keep the account they started with. */
  Rpc.make("Claude.setActiveAccount", {
    payload: { accountId: Schema.String },
    error: ClaudeAccountNotFound,
  }),
)
