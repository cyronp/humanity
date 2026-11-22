import { useEffect, useSyncExternalStore } from "react"

export interface PaletteCommand {
  readonly id: string
  readonly title: string
  readonly group: string
  readonly keywords?: ReadonlyArray<string> | undefined
  readonly shortcut?: string | undefined
  readonly run: () => void
}

export type PaletteMode = "all" | "actions" | "threads" | "messages"

export interface PaletteQuery {
  readonly mode: PaletteMode
  readonly text: string
}

const PREFIXES: ReadonlyArray<readonly [string, PaletteMode]> = [
  [">", "actions"],
  ["#", "threads"],
  ["?", "messages"],
]

export const parsePaletteQuery = (input: string): PaletteQuery => {
  const trimmed = input.trimStart()
  for (const [prefix, mode] of PREFIXES) {
    if (trimmed.startsWith(prefix)) return { mode, text: trimmed.slice(prefix.length).trim() }
  }
  return { mode: "all", text: input.trim() }
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
export const RECENT_LIMIT = 5

export const readRecent = (): ReadonlyArray<string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, RECENT_LIMIT)
      : []
  } catch {
    return []
  }
}

export const withRecent = (recent: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  [id, ...recent.filter((each) => each !== id)].slice(0, RECENT_LIMIT)

export const storeRecent = (recent: ReadonlyArray<string>) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {}
}

export const recentCommands = (
  commands: ReadonlyArray<PaletteCommand>,
  recent: ReadonlyArray<string>,
): ReadonlyArray<PaletteCommand> =>
  recent.flatMap((id) => {
    const found = commands.find((command) => command.id === id)
    return found === undefined ? [] : [found]
  })

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
