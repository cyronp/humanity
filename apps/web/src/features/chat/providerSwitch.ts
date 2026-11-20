import type { MessageContent } from "@humanity/contracts"

type ProviderSwitch = Extract<MessageContent, { _tag: "provider_switch" }>

/** A token count as people read it: 850, 1.2k, 48k. */
export const formatTokens = (tokens: number): string => {
  if (tokens < 1_000) return String(tokens)
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return `${Math.round(tokens / 1_000)}k`
}

/** How heavy a handoff is: under 4k tokens light, under 10k medium, else heavy. */
export type HandoffWeight = "light" | "medium" | "heavy"

export const handoffWeight = (tokens: number): HandoffWeight =>
  tokens < 4_000 ? "light" : tokens < 10_000 ? "medium" : "heavy"

/** The names of the models before and after, as the model picker shows them. */
export interface SwitchNames {
  readonly from: string
  readonly to: string
}

/** The handoff's cost, when one was recorded and there was anything to send. */
export const handoffTokens = (content: ProviderSwitch): number | undefined =>
  content.included === 0 || content.tokens === undefined || content.tokens === 0
    ? undefined
    : content.tokens

/**
 * What happened to the conversation at the switch. `delivered` once the human's next message has
 * carried the context to the new agent.
 */
export const providerSwitchStatus = (content: ProviderSwitch, delivered = false): string => {
  if (content.resumed) {
    const back = "Resumes its own conversation"
    if (content.included === 0) return back
    return `${back} · What it missed ${delivered ? "was" : "will be"} transferred`
  }
  if (content.included === 0) return ""
  return delivered ? "Context transferred" : "Context will be transferred"
}

/** The whole divider as one line of text, for its tooltip and for screen readers. */
export const providerSwitchSummary = (
  content: ProviderSwitch,
  names: SwitchNames,
  delivered = false,
): string => {
  const tokens = handoffTokens(content)
  return [
    `${names.from} → ${names.to}`,
    providerSwitchStatus(content, delivered),
    tokens === undefined ? "" : `~${formatTokens(tokens)} tokens`,
  ]
    .filter((part) => part !== "")
    .join(" · ")
}

/** What the divider's tooltip adds: how much of the conversation went, and how cost is counted. */
export const providerSwitchDetail = (content: ProviderSwitch): string => {
  if (content.included === 0) return "Nothing to transfer."
  const entries = (count: number, older = false) =>
    `${count} ${older ? "older " : ""}${count === 1 ? "entry" : "entries"}`
  const left =
    content.omitted === 0
      ? ""
      : `, ${entries(content.omitted, true)} the agent can read when it needs ${content.omitted === 1 ? "it" : "them"}`
  const estimate =
    handoffTokens(content) === undefined
      ? ""
      : ` Tokens are estimated at about 4 characters each; the provider's own count may differ.`
  return `${entries(content.included)} of the conversation in full${left}.${estimate}`
}
