import type { AgentCli, AgentProvider } from "@humanity/contracts"
import { PROVIDER_NAMES } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const agentCliAtom = Atom.family((provider: AgentProvider) =>
  HumanityClient.query(
    "AgentClis.status",
    { provider },
    { reactivityKeys: [keys.agentCli(provider)] },
  ),
)

export const updateAgentCliAtom = HumanityClient.mutation("AgentClis.update")

const ACCOUNT_KEYS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": keys.claude,
  codex: keys.codex,
  kiro: keys.kiro,
}

export const updatedKeys = (provider: AgentProvider) => [
  keys.agentCli(provider),
  ACCOUNT_KEYS[provider],
]

export const cliProblem = (cli: AgentCli): string | undefined => {
  const name = PROVIDER_NAMES[cli.provider]
  if (cli.path === null) return `${name} is not installed on this computer.`
  if (cli.outdated && cli.version !== null && cli.minimumVersion !== null) {
    return `${name} ${cli.version} is older than Humanity is tested with (${cli.minimumVersion} or later). Threads may not work properly until it is updated.`
  }
  return undefined
}

export const updateOutcome = (before: string | null, after: AgentCli): string => {
  const name = PROVIDER_NAMES[after.provider]
  if (after.version === null) return `${name} was updated.`
  if (before === after.version) return `${name} ${after.version} is already the latest version.`
  return `${name} was updated to ${after.version}.`
}
