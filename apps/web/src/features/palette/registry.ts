import { type ReactNode, useEffect, useSyncExternalStore } from "react"
import { readStored, writeStoredJson } from "@/lib/storage"

export type PaletteOutcome = { readonly error: string } | undefined

export interface PaletteResultsProps {
  readonly query: string
  readonly close: () => void
}

export interface PalettePage {
  readonly title: string
  readonly placeholder?: string | undefined
  readonly items?: ReadonlyArray<PaletteCommand> | undefined
  readonly Results?: ((props: PaletteResultsProps) => ReactNode) | undefined
}

interface PaletteCommandBase {
  readonly id: string
  readonly title: string
  readonly group: string
  readonly keywords?: ReadonlyArray<string> | undefined
  readonly shortcut?: string | undefined
  readonly detail?: string | undefined
  readonly checked?: boolean | undefined
  readonly icon?: ReactNode | undefined
}

export type PaletteCommand = PaletteCommandBase &
  (
    | {
        readonly run: () => void | Promise<PaletteOutcome>
        readonly page?: undefined
      }
    | { readonly page: PalettePage; readonly run?: undefined }
  )

export type PaletteMode = "all" | "actions" | "threads" | "messages" | "files" | "skills"

export interface PaletteQuery {
  readonly mode: PaletteMode
  readonly text: string
}

const PREFIXES: ReadonlyArray<readonly [string, PaletteMode]> = [
  [">", "actions"],
  ["#", "threads"],
  ["?", "messages"],
  ["@", "files"],
  ["/", "skills"],
]

export const parsePaletteQuery = (input: string): PaletteQuery => {
  const trimmed = input.trimStart()
  for (const [prefix, mode] of PREFIXES) {
    if (trimmed.startsWith(prefix)) return { mode, text: trimmed.slice(prefix.length).trim() }
  }
  return { mode: "all", text: input.trim() }
}

export interface PaletteInput {
  readonly mode: PaletteMode
  readonly prefix: string
  readonly body: string
}

export const splitPaletteInput = (input: string): PaletteInput => {
  const trimmed = input.trimStart()
  for (const [prefix, mode] of PREFIXES) {
    if (trimmed.startsWith(prefix)) return { mode, prefix, body: trimmed.slice(prefix.length) }
  }
  return { mode: "all", prefix: "", body: input }
}

export interface ShortcutKey {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

export const isPaletteShortcut = (event: ShortcutKey, mac: boolean): boolean => {
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!mod || event.altKey) return false
  const key = event.key.toLowerCase()
  return (key === "k" && !event.shiftKey) || (key === "p" && event.shiftKey)
}

export const insideTerminal = (target: EventTarget | null): boolean =>
  typeof Element !== "undefined" &&
  target instanceof Element &&
  target.closest(".xterm, [data-terminal-dock]") !== null

const RECENT_KEY = "humanity.palette.recent"
const USAGE_KEY = "humanity.palette.usage"
const THREAD_VISITS_KEY = "humanity.palette.threads"
export const RECENT_LIMIT = 5
const USAGE_LIMIT = 200
const HALF_LIFE_DAYS = 14
const DAY_MS = 86_400_000

export interface UseEntry {
  readonly count: number
  readonly last: number
}

export type Usage = Readonly<Record<string, UseEntry>>

const parseUsage = (raw: string | null): Usage | undefined => {
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    const usage: Record<string, UseEntry> = {}
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) continue
      const { count, last } = entry as { count?: unknown; last?: unknown }
      if (typeof count === "number" && typeof last === "number") usage[id] = { count, last }
    }
    return usage
  } catch {
    return {}
  }
}

export const usageFromRecent = (recent: ReadonlyArray<string>, now: number): Usage =>
  Object.fromEntries(recent.map((id, index) => [id, { count: 1, last: now - index * 60_000 }]))

export const readUsage = (): Usage => {
  const stored = parseUsage(readStored(USAGE_KEY))
  if (stored !== undefined) return stored
  try {
    const parsed: unknown = JSON.parse(readStored(RECENT_KEY) ?? "[]")
    return Array.isArray(parsed)
      ? usageFromRecent(
          parsed.filter((id): id is string => typeof id === "string"),
          Date.now(),
        )
      : {}
  } catch {
    return {}
  }
}

export const storeUsage = (usage: Usage) => writeStoredJson(USAGE_KEY, usage)

export const frecency = (entry: UseEntry | undefined, now: number): number =>
  entry === undefined
    ? 0
    : entry.count * 0.5 ** (Math.max(0, now - entry.last) / DAY_MS / HALF_LIFE_DAYS)

export const withUse = (usage: Usage, id: string, now: number): Usage => {
  const previous = usage[id]
  const next: Record<string, UseEntry> = {
    ...usage,
    [id]: { count: (previous?.count ?? 0) + 1, last: now },
  }
  const ids = Object.keys(next)
  if (ids.length <= USAGE_LIMIT) return next
  const kept = ids
    .toSorted((a, b) => frecency(next[b], now) - frecency(next[a], now))
    .slice(0, USAGE_LIMIT)
  return Object.fromEntries(kept.map((each) => [each, next[each] as UseEntry]))
}

export const withUseNow = (usage: Usage, id: string): Usage => withUse(usage, id, Date.now())

export const rankedByUse = <T>(
  items: ReadonlyArray<T>,
  idOf: (item: T) => string,
  usage: Usage,
  now: number,
): ReadonlyArray<T> =>
  items
    .map((item, index) => ({ item, index, score: frecency(usage[idOf(item)], now) }))
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)

export const frequentCommands = (
  commands: ReadonlyArray<PaletteCommand>,
  usage: Usage,
  now: number,
  limit = RECENT_LIMIT,
): ReadonlyArray<PaletteCommand> =>
  rankedByUse(
    commands.filter((command) => usage[command.id] !== undefined),
    (command) => command.id,
    usage,
    now,
  ).slice(0, limit)

export const readThreadVisits = (): Usage => parseUsage(readStored(THREAD_VISITS_KEY)) ?? {}

export const recordThreadVisit = (sessionId: string) =>
  writeStoredJson(THREAD_VISITS_KEY, withUse(readThreadVisits(), sessionId, Date.now()))

export const flattenPages = (
  commands: ReadonlyArray<PaletteCommand>,
): ReadonlyArray<PaletteCommand> =>
  commands.flatMap((command) =>
    command.page?.items === undefined
      ? []
      : command.page.items.map((child): PaletteCommand => ({
          ...child,
          title: `${command.title}: ${child.title}`,
          group: command.group,
          keywords: [...(command.keywords ?? []), ...(child.keywords ?? [])],
        })),
  )

export const groupCommands = (
  commands: ReadonlyArray<PaletteCommand>,
): ReadonlyArray<readonly [string, ReadonlyArray<PaletteCommand>]> => {
  const groups = new Map<string, Array<PaletteCommand>>()
  for (const command of commands) {
    const group = groups.get(command.group) ?? []
    group.push(command)
    groups.set(command.group, group)
  }
  return [...groups.entries()]
}

const sources = new Map<string, ReadonlyArray<PaletteCommand>>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyArray<PaletteCommand> = []

const publish = () => {
  snapshot = [...sources.values()].flat()
  for (const listener of listeners) listener()
}

export const setPaletteCommands = (source: string, commands: ReadonlyArray<PaletteCommand>) => {
  sources.set(source, commands)
  publish()
}

export const clearPaletteCommands = (source: string) => {
  if (sources.delete(source)) publish()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useRegisteredCommands = (): ReadonlyArray<PaletteCommand> =>
  useSyncExternalStore(subscribe, () => snapshot)

export const usePaletteCommands = (source: string, commands: ReadonlyArray<PaletteCommand>) => {
  useEffect(() => {
    setPaletteCommands(source, commands)
  }, [source, commands])
  useEffect(() => () => clearPaletteCommands(source), [source])
}

export type PaletteSourceMode = "files" | "skills"

export interface PaletteSource {
  readonly Results: (props: PaletteResultsProps) => ReactNode
}

const searchSources = new Map<PaletteSourceMode, PaletteSource>()
const sourceListeners = new Set<() => void>()
let sourceSnapshot: ReadonlyMap<PaletteSourceMode, PaletteSource> = new Map()

const publishSources = () => {
  sourceSnapshot = new Map(searchSources)
  for (const listener of sourceListeners) listener()
}

const subscribeSources = (listener: () => void) => {
  sourceListeners.add(listener)
  return () => {
    sourceListeners.delete(listener)
  }
}

export const usePaletteSources = (): ReadonlyMap<PaletteSourceMode, PaletteSource> =>
  useSyncExternalStore(subscribeSources, () => sourceSnapshot)

export const usePaletteSource = (mode: PaletteSourceMode, source: PaletteSource | undefined) => {
  useEffect(() => {
    if (source === undefined) return
    searchSources.set(mode, source)
    publishSources()
    return () => {
      if (searchSources.get(mode) === source) {
        searchSources.delete(mode)
        publishSources()
      }
    }
  }, [mode, source])
}
