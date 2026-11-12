import type { McpServer, McpTransport } from "@humanity/contracts"

/** The message box after an insertion, and where the caret goes. */
export interface PromptEdit {
  readonly text: string
  readonly caret: number
}

/** What the MCP & Skills menu, or a diff's reference button, puts in the message box. */
export type PromptInsertion =
  | { readonly kind: "skill"; readonly invocation: string }
  | { readonly kind: "mcp"; readonly server: string }
  /** A place in a file, `path:line`, as a diff names it. */
  | { readonly kind: "reference"; readonly reference: string }

/**
 * How a message names an MCP server: the prefix of its tools'
 * names (`mcp__<server>__<tool>`), which is how the agent knows them.
 */
export const mcpMention = (server: string) => `mcp__${server}`

/**
 * A skill runs as a slash command, and Claude Code reads one only at the
 * very start of the message: it goes first, whatever is already typed
 * follows as its arguments, and the caret moves to the end. Picking the
 * skill the message already starts with changes nothing.
 */
export const insertSkill = (text: string, invocation: string): PromptEdit => {
  const rest = text.trimStart()
  if (rest === invocation || rest.startsWith(`${invocation} `)) {
    return { text, caret: text.length }
  }
  const next = rest === "" ? `${invocation} ` : `${invocation} ${rest}`
  return { text: next, caret: next.length }
}

/**
 * How well a menu entry matches the search, for cmdk: 1 when its name holds
 * the words, less when only its description does, 0 when nothing does.
 * Plain substrings, so "docs" does not find "deploy" by its scattered letters.
 */
export const menuScore = (name: string, details: ReadonlyArray<string>, search: string) => {
  const needle = search.trim().toLowerCase()
  if (needle === "") return 1
  const haystack = name.toLowerCase()
  if (haystack.startsWith(needle)) return 1
  if (haystack.includes(needle)) return 0.8
  return details.some((detail) => detail.toLowerCase().includes(needle)) ? 0.4 : 0
}

/** `token` in place of the selection, set apart from the words around it by single spaces. */
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
    : insertAtSelection(
        text,
        insertion.kind === "mcp" ? mcpMention(insertion.server) : insertion.reference,
        selection.start,
        selection.end,
      )

/** One line about how a server is reached: its command or its address. */
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

/** Servers the agent gets: every repository server, and Humanity's enabled ones. */
export const usableServers = (servers: ReadonlyArray<McpServer>) =>
  servers.filter((server) => server.enabled)
