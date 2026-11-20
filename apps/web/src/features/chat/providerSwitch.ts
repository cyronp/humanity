import { type MessageContent, PROVIDER_NAMES } from "@humanity/contracts"

type ProviderSwitch = Extract<MessageContent, { _tag: "provider_switch" }>

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/** What the agent the thread moved to starts from, for the divider in the chat. */
export const providerSwitchSummary = (content: ProviderSwitch): string => {
  const to = PROVIDER_NAMES[content.to]
  const model = content.model === null ? "" : ` · ${content.model}`
  if (content.resumed) {
    return content.included === 0
      ? `Back on ${to}${model} · it picks up its own conversation`
      : `Back on ${to}${model} · it picks up its own conversation, plus ${plural(content.included, "message")} from while it was away`
  }
  if (content.included === 0) return `Continued on ${to}${model}`
  const left =
    content.omitted === 0 ? "" : `; ${content.omitted} older ones it can read when it needs them`
  return `Continued on ${to}${model} · ${plural(content.included, "earlier message")} go with your next message as context${left}`
}
