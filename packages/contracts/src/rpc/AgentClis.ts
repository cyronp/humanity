import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AgentCli, AgentCliUpdate } from "../domain/AgentCli.ts"
import { AgentProvider } from "../domain/Provider.ts"
import { CliNotInstalled, CliUpdateFailed } from "../Errors.ts"

/** The agents' CLIs on the human's computer: where they are, their version, and updating them. */
export const AgentClisRpcs = RpcGroup.make(
  /** Looks for the provider's CLI again and asks its version. Starts no session. */
  Rpc.make("AgentClis.status", {
    payload: { provider: AgentProvider },
    success: AgentCli,
  }),
  /**
   * Runs the CLI's own updater (`claude update`, `codex update`,
   * `kiro-cli update`), which updates it where and how it was installed.
   * Only ever started by the human.
   */
  Rpc.make("AgentClis.update", {
    payload: { provider: AgentProvider },
    success: AgentCliUpdate,
    error: Schema.Union([CliNotInstalled, CliUpdateFailed]),
  }),
)
