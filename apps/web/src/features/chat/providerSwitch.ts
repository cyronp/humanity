import { type MessageContent, PROVIDER_NAMES } from "@humanity/contracts"

type ProviderSwitch = Extract<MessageContent, { _tag: "provider_switch" }>

/** A token count as people read it: 850, 1.2k, 48k. */
export const formatTokens = (tokens: number): string => {
  if (tokens < 1_000) return String(tokens)
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return `${Math.round(tokens / 1_000)}k`
}

const cost = (content: ProviderSwitch) =>
  content.tokens === undefined || content.tokens === 0
    ? ""
    : ` (~${formatTokens(content.tokens)} tokens)`

/**
 * The divider where a thread moved to another provider. `delivered` once the human's next message
 * has carried the context to the new agent.
 */
export const providerSwitchSummary = (content: ProviderSwitch, delivered = false): string => {
  const to = PROVIDER_NAMES[content.to]
  const model = content.model === null ? "" : ` · ${content.model}`
  if (content.resumed) {
    const back = `Back on ${to}${model} · Resumes its own conversation`
    if (content.included === 0) return back
    return delivered
      ? `${back} · What it missed was transferred${cost(content)}`
      : `${back} · What it missed will be transferred with your next message${cost(content)}`
  }
  if (content.included === 0) return `Continued on ${to}${model}`
  return delivered
    ? `Continued on ${to}${model} · Context transferred${cost(content)}`
    : `Continued on ${to}${model} · Context will be transferred with your next message${cost(content)}`
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
    content.tokens === undefined || content.tokens === 0
      ? ""
      : ` Tokens are estimated at about 4 characters each; the provider's own count may differ.`
  return `${entries(content.included)} of the conversation in full${left}.${estimate}`
}
