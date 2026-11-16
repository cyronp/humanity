import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { CodexStatus } from "../domain/Codex.ts"

export const CodexRpcs = RpcGroup.make(
  /**
   * The Codex login threads run as, and the models it offers. Never fails: a
   * Codex that cannot start is reported as `Unavailable`, with the reason.
   * The result is cached briefly; `refresh: true` checks again right away.
   */
  Rpc.make("Codex.status", {
    payload: { refresh: Schema.Boolean },
    success: CodexStatus,
  }),
)
