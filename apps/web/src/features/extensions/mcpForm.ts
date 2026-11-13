import type { McpServer, McpTransportInput } from "@humanity/contracts"

/**
 * The MCP server editor's state, and the checks that turn it into what the
 * daemon saves. Kept free of React so the rules are tested on their own.
 */

export interface EntryDraft {
  readonly id: number
  readonly name: string
  /** What the human typed. Empty on a `saved` row means "keep the saved value". */
  readonly value: string
  /** The daemon already holds a value under this name. */
  readonly saved: boolean
}

export type TransportKind = McpTransportInput["_tag"]

export interface McpDraft {
  readonly name: string
  readonly transport: TransportKind
  readonly command: string
  /** One argument per line, so arguments with spaces need no quoting. */
  readonly args: string
  readonly url: string
  readonly env: ReadonlyArray<EntryDraft>
  readonly headers: ReadonlyArray<EntryDraft>
}

let nextId = 0
export const entryId = () => ++nextId

export const blankEntry = (): EntryDraft => ({ id: entryId(), name: "", value: "", saved: false })

export const EMPTY_DRAFT: McpDraft = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  env: [],
  headers: [],
}

const savedEntries = (names: ReadonlyArray<string>): ReadonlyArray<EntryDraft> =>
  names.map((name) => ({ id: entryId(), name, value: "", saved: true }))

/** The editor for a saved server. Values never come back from the daemon: rows start empty and keep theirs. */
export const draftFromServer = (server: McpServer): McpDraft => {
  const transport = server.transport
  return transport._tag === "stdio"
    ? {
        ...EMPTY_DRAFT,
        name: server.name,
        transport: "stdio",
        command: transport.command,
        args: transport.args.join("\n"),
        env: savedEntries(transport.env),
      }
    : {
        ...EMPTY_DRAFT,
        name: server.name,
        transport: transport._tag,
        url: transport.url,
        headers: savedEntries(transport.headers),
      }
}

const SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/
const URL = /^https?:\/\/[^\s]{1,2048}$/

type Checked<A> = { readonly ok: A } | { readonly error: string }

const checkEntries = (
  entries: ReadonlyArray<EntryDraft>,
  pattern: RegExp,
  what: string,
  nameRule: string,
): Checked<ReadonlyArray<{ readonly name: string; readonly value: string | null }>> => {
  const out: Array<{ name: string; value: string | null }> = []
  for (const entry of entries) {
    const name = entry.name.trim()
    // A row left entirely blank is ignored.
    if (name === "" && entry.value === "") continue
    if (!pattern.test(name)) {
      return { error: `"${name}" is not a valid ${what} name. ${nameRule}` }
    }
    if (out.some((other) => other.name === name)) {
      return { error: `The ${what} ${name} is listed twice.` }
    }
    if (entry.value === "" && !entry.saved)
      return { error: `Enter a value for the ${what} ${name}.` }
    out.push({ name, value: entry.value === "" ? null : entry.value })
  }
  return { ok: out }
}

/** What the daemon saves, or the first thing the human needs to fix. */
export const buildMcpInput = (
  draft: McpDraft,
): Checked<{ readonly name: string; readonly transport: McpTransportInput }> => {
  const name = draft.name.trim()
  if (!SERVER_NAME.test(name)) {
    return {
      error:
        name === ""
          ? "Give the server a name."
          : 'Server names use letters, digits, "-" and "_" only, at most 64 characters.',
    }
  }
  if (draft.transport === "stdio") {
    const command = draft.command.trim()
    if (command === "") return { error: "Enter the command that starts the server, like npx." }
    const env = checkEntries(
      draft.env,
      ENV_NAME,
      "environment variable",
      'Use letters, digits and "_", not starting with a digit.',
    )
    if ("error" in env) return env
    const args = draft.args
      .split(/\r?\n/)
      .map((arg) => arg.trim())
      .filter((arg) => arg !== "")
    return { ok: { name, transport: { _tag: "stdio", command, args, env: env.ok } } }
  }
  const url = draft.url.trim()
  if (!URL.test(url))
    return { error: "Enter the server's address, starting with https:// or http://." }
  const headers = checkEntries(draft.headers, HEADER_NAME, "header", 'Use letters, digits and "-".')
  if ("error" in headers) return headers
  return { ok: { name, transport: { _tag: draft.transport, url, headers: headers.ok } } }
}

const SKILL_NAME = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `Review SQL!` → `review-sql`, the shape a skill name must have. */
export const skillSlug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "")

export const checkSkill = (draft: {
  readonly name: string
  readonly description: string
  readonly instructions: string
}): Checked<{
  readonly name: string
  readonly description: string
  readonly instructions: string
}> => {
  const name = draft.name.trim()
  if (!SKILL_NAME.test(name)) {
    return {
      error:
        name === ""
          ? "Give the skill a name."
          : "Skill names are lowercase words joined by hyphens, like review-sql.",
    }
  }
  const description = draft.description.replace(/\s+/g, " ").trim()
  if (description === "") {
    return {
      error: "Describe what the skill does and when to use it; the agent picks skills by it.",
    }
  }
  if (description.length > 1024) return { error: "Keep the description under 1024 characters." }
  if (draft.instructions.trim() === "")
    return { error: "Write the instructions the agent follows." }
  return { ok: { name, description, instructions: draft.instructions } }
}
