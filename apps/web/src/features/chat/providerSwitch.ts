import type { MessageContent } from "@humanity/contracts"

type ProviderSwitch = Extract<MessageContent, { _tag: "provider_switch" }>

export const formatTokens = (tokens: number): string => {
  if (tokens < 1_000) return String(tokens)
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return `${Math.round(tokens / 1_000)}k`
}

export type HandoffWeight = "light" | "medium" | "heavy"

export const handoffWeight = (tokens: number): HandoffWeight =>
  tokens < 4_000 ? "light" : tokens < 10_000 ? "medium" : "heavy"

export interface SwitchNames {
  readonly from: string
  readonly to: string
}

export const handoffTokens = (content: ProviderSwitch): number | undefined =>
  content.included === 0 || content.tokens === undefined || content.tokens === 0
    ? undefined
    : content.tokens

export const providerSwitchStatus = (content: ProviderSwitch, delivered = false): string => {
  if (content.resumed) {
    const back = "Resumes its own conversation"
    if (content.included === 0) return back
    return `${back} · What it missed ${delivered ? "was" : "will be"} transferred`
  }
  if (content.included === 0) return ""
  return delivered ? "Context transferred" : "Context will be transferred"
}

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
