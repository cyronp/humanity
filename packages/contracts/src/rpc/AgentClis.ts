import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AgentCli, AgentCliUpdate } from "../domain/AgentCli.ts"
import { AgentProvider } from "../domain/Provider.ts"
import { CliNotInstalled, CliUpdateFailed } from "../Errors.ts"

export const AgentClisRpcs = RpcGroup.make(
  Rpc.make("AgentClis.status", {
    payload: { provider: AgentProvider },
    success: AgentCli,
  }),
  Rpc.make("AgentClis.update", {
    payload: { provider: AgentProvider },
    success: AgentCliUpdate,
    error: Schema.Union([CliNotInstalled, CliUpdateFailed]),
  }),
)
