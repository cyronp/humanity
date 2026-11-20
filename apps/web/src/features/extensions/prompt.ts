import type { McpServer, McpTransport } from "@humanity/contracts"

export interface PromptEdit {
  readonly text: string
  readonly caret: number
}

export type PromptInsertion =
  | { readonly kind: "skill"; readonly invocation: string }
  | { readonly kind: "mcp"; readonly server: string }
  | { readonly kind: "reference"; readonly reference: string }
  | { readonly kind: "block"; readonly text: string }

export const mcpMention = (server: string) => `mcp__${server}`

export const appendBlock = (text: string, block: string): PromptEdit => {
  const before = text.trimEnd()
  const next = `${before}${before === "" ? "" : "\n\n"}${block.trim()}\n\n`
  return { text: next, caret: next.length }
}

export const insertSkill = (text: string, invocation: string): PromptEdit => {
  const rest = text.trimStart()
  if (rest === invocation || rest.startsWith(`${invocation} `)) {
    return { text, caret: text.length }
  }
  const next = rest === "" ? `${invocation} ` : `${invocation} ${rest}`
  return { text: next, caret: next.length }
}

export const menuScore = (name: string, details: ReadonlyArray<string>, search: string) => {
  const needle = search.trim().toLowerCase()
  if (needle === "") return 1
  const haystack = name.toLowerCase()
  if (haystack.startsWith(needle)) return 1
  if (haystack.includes(needle)) return 0.8
  return details.some((detail) => detail.toLowerCase().includes(needle)) ? 0.4 : 0
}

export const insertAtSelection = (
  text: string,
  token: string,
  selectionStart: number,
  selectionEnd: number,
): PromptEdit => {
  const start = Math.max(0, Math.min(selectionStart, text.length))
  const end = Math.max(start, Math.min(selectionEnd, text.length))
  const before = text.slice(0, start)
  const after = text.slice(end)
  const lead = before === "" || /\s$/.test(before) ? "" : " "
  const trail = /^\s/.test(after) ? "" : " "
  const head = `${before}${lead}${token}${trail}`
  return { text: `${head}${after}`, caret: head.length }
}

export const applyInsertion = (
  text: string,
  insertion: PromptInsertion,
  selection: { readonly start: number; readonly end: number },
): PromptEdit =>
  insertion.kind === "skill"
    ? insertSkill(text, insertion.invocation)
    : insertion.kind === "block"
      ? appendBlock(text, insertion.text)
      : insertAtSelection(
          text,
          insertion.kind === "mcp" ? mcpMention(insertion.server) : insertion.reference,
          selection.start,
          selection.end,
        )

export const describeTransport = (transport: McpTransport): string => {
  switch (transport._tag) {
    case "stdio":
      return [transport.command, ...transport.args].join(" ")
    case "http":
    case "sse":
      return transport.url
  }
}

export const TRANSPORT_LABELS: Record<McpTransport["_tag"], string> = {
  stdio: "Local command",
  http: "HTTP",
  sse: "SSE",
}

export const usableServers = (servers: ReadonlyArray<McpServer>) =>
  servers.filter((server) => server.enabled)
