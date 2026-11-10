import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ClaudeStatus } from "../domain/Claude.ts"

export const ClaudeRpcs = RpcGroup.make(
  /**
   * The Claude account the agent sessions run as. Never fails: a Claude Code
   * that cannot start is reported as `Unavailable`, with the reason. The result
   * is cached briefly; `refresh: true` checks again right away.
   */
  Rpc.make("Claude.status", {
    payload: { refresh: Schema.Boolean },
    success: ClaudeStatus,
  }),
)
