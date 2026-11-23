import {
  type AgentProvider,
  PROVIDER_NAMES,
  type Session,
  type SessionStatus,
} from "@humanity/contracts"

export const FILTER_KEYS = ["is", "project", "provider", "branch"] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

export type ThreadFilters = Readonly<Record<FilterKey, ReadonlyArray<string>>>

export const NO_FILTERS: ThreadFilters = { is: [], project: [], provider: [], branch: [] }

export interface FilterToken {
  readonly key: FilterKey | undefined
  readonly value: string
  readonly start: number
}

export interface ParsedFilters {
  readonly text: string
  readonly filters: ThreadFilters
  readonly last: FilterToken | undefined
}

const TOKEN = /(\w+):"([^"]*)"?|(\S+)/g

const isFilterKey = (key: string): key is FilterKey =>
  (FILTER_KEYS as ReadonlyArray<string>).includes(key)

export const parseFilters = (input: string): ParsedFilters => {
  const filters: Record<FilterKey, Array<string>> = {
    is: [],
    project: [],
    provider: [],
    branch: [],
  }
  const words: Array<string> = []
  let last: FilterToken | undefined
  for (const match of input.matchAll(TOKEN)) {
    const start = match.index
    const quotedKey = match[1]?.toLowerCase()
    const raw = match[3] ?? ""
    const separator = raw.indexOf(":")
    const key = quotedKey ?? (separator > 0 ? raw.slice(0, separator).toLowerCase() : undefined)
    const value = quotedKey !== undefined ? (match[2] ?? "") : raw.slice(separator + 1)
    const ending = start + match[0].length === input.length
    if (key !== undefined && isFilterKey(key)) {
      if (value.trim() !== "") filters[key].push(value.trim().toLowerCase())
      if (ending) last = { key, value, start }
      continue
    }
    words.push(raw)
    if (ending) last = { key: undefined, value: raw, start }
  }
  return { text: words.join(" "), filters, last }
}

export const hasFilters = (filters: ThreadFilters): boolean =>
  FILTER_KEYS.some((key) => filters[key].length > 0)

export const STATUS_WORDS: ReadonlyArray<{
  readonly word: string
  readonly label: string
  readonly matches: (status: SessionStatus) => boolean
}> = [
  {
    word: "waiting",
    label: "Waiting for you",
    matches: (status) => status === "waiting_for_human",
  },
  { word: "running", label: "Working", matches: (status) => status === "running" },
  { word: "error", label: "Stopped with an error", matches: (status) => status === "error" },
  { word: "idle", label: "Done", matches: (status) => status === "idle" },
  { word: "interrupted", label: "Interrupted", matches: (status) => status === "interrupted" },
  { word: "open", label: "Not ended", matches: (status) => status !== "ended" },
  { word: "ended", label: "Ended", matches: (status) => status === "ended" },
]

const PROVIDER_WORDS: ReadonlyArray<readonly [string, AgentProvider]> = [
  ["claude", "claude-code"],
  ["codex", "codex"],
  ["kiro", "kiro"],
  ["antigravity", "antigravity"],
]

const providerMatches = (provider: AgentProvider, value: string): boolean =>
  provider.startsWith(value) ||
  PROVIDER_NAMES[provider].toLowerCase().startsWith(value) ||
  PROVIDER_WORDS.some(([word, each]) => each === provider && word.startsWith(value))

const anyOf = (values: ReadonlyArray<string>, matches: (value: string) => boolean): boolean =>
  values.length === 0 || values.some(matches)

export const threadMatches = (
  session: Pick<Session, "status" | "provider" | "branch">,
  projectName: string,
  filters: ThreadFilters,
): boolean =>
  anyOf(filters.is, (value) =>
    STATUS_WORDS.some((status) => status.word.startsWith(value) && status.matches(session.status)),
  ) &&
  anyOf(filters.project, (value) => projectName.toLowerCase().includes(value)) &&
  anyOf(filters.provider, (value) => providerMatches(session.provider, value)) &&
  anyOf(filters.branch, (value) => session.branch.toLowerCase().includes(value))

export const asksForEnded = (filters: ThreadFilters): boolean =>
  filters.is.some((value) => "ended".startsWith(value))

export interface FilterSuggestion {
  readonly label: string
  readonly detail: string
  readonly insert: string
}

const quoted = (value: string) => (/\s/.test(value) ? `"${value}"` : value)

const KEY_DETAIL: Record<FilterKey, string> = {
  is: "Status: waiting, running, error, idle, ended…",
  project: "A project's name",
  provider: "Claude, Codex, Kiro or Antigravity",
  branch: "Part of the branch's name",
}

export const filterSuggestions = (
  last: FilterToken | undefined,
  projectNames: ReadonlyArray<string>,
  branches: ReadonlyArray<string>,
): ReadonlyArray<FilterSuggestion> => {
  if (last === undefined) return []
  if (last.key === undefined) {
    const typed = last.value.toLowerCase()
    if (typed.length < 2) return []
    return FILTER_KEYS.filter((key) => key.startsWith(typed) && key !== typed).map((key) => ({
      label: `${key}:`,
      detail: KEY_DETAIL[key],
      insert: `${key}:`,
    }))
  }
  const key = last.key
  const typed = last.value.replace(/^"/, "").toLowerCase()
  const values: ReadonlyArray<readonly [string, string]> =
    key === "is"
      ? STATUS_WORDS.map((status) => [status.word, status.label] as const)
      : key === "provider"
        ? PROVIDER_WORDS.map(([word, provider]) => [word, PROVIDER_NAMES[provider]] as const)
        : key === "project"
          ? projectNames.map((name) => [name, "Project"] as const)
          : branches.map((branch) => [branch, "Branch"] as const)
  return values
    .filter(([value]) => value.toLowerCase().includes(typed) && value.toLowerCase() !== typed)
    .slice(0, 8)
    .map(([value, detail]) => ({
      label: `${key}:${value}`,
      detail,
      insert: `${key}:${quoted(value)} `,
    }))
}

export const applySuggestion = (input: string, last: FilterToken, insert: string): string =>
  `${input.slice(0, last.start)}${insert}`
