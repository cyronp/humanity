import type { AgentCli, AgentProvider } from "@humanity/contracts"
import { PROVIDER_NAMES } from "@humanity/contracts"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

/** A provider's CLI as installed on this computer. Asking runs `<cli> --version`, nothing more. */
export const agentCliAtom = Atom.family((provider: AgentProvider) =>
  HumanityClient.query(
    "AgentClis.status",
    { provider },
    { reactivityKeys: [keys.agentCli(provider)] },
  ),
)

/** Runs the CLI's own updater, then refreshes what is known about it and its accounts. */
export const updateAgentCliAtom = HumanityClient.mutation("AgentClis.update")

/** The reactivity keys an update touches: the CLI itself, and the accounts it reports. */
const ACCOUNT_KEYS: Readonly<Record<AgentProvider, string>> = {
  "claude-code": keys.claude,
  codex: keys.codex,
  kiro: keys.kiro,
}

export const updatedKeys = (provider: AgentProvider) => [
  keys.agentCli(provider),
  ACCOUNT_KEYS[provider],
]

/**
 * What to tell the human about a CLI, when there is something to tell:
 * missing, or older than the version Humanity is tested against.
 */
export const cliProblem = (cli: AgentCli): string | undefined => {
  const name = PROVIDER_NAMES[cli.provider]
  if (cli.path === null) return `${name} is not installed on this computer.`
  if (cli.outdated && cli.version !== null && cli.minimumVersion !== null) {
    return `${name} ${cli.version} is older than Humanity is tested with (${cli.minimumVersion} or later). Threads may not work properly until it is updated.`
  }
  return undefined
}

/** What an update did, in one line: the version it moved to, or that there was nothing newer. */
export const updateOutcome = (before: string | null, after: AgentCli): string => {
  const name = PROVIDER_NAMES[after.provider]
  if (after.version === null) return `${name} was updated.`
  if (before === after.version) return `${name} ${after.version} is already the latest version.`
  return `${name} was updated to ${after.version}.`
}
