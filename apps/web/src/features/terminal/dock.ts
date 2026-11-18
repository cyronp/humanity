import { useCallback, useState } from "react"

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the layout still works.
  }
}

export const parseFlag = (raw: string | null, fallback: boolean): boolean =>
  raw === "1" ? true : raw === "0" ? false : fallback

/** An on/off part of the layout, remembered in the browser. */
export const useStoredFlag = (key: string, fallback: boolean) => {
  const [value, setValue] = useState(() => parseFlag(read(key), fallback))
  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      write(key, next ? "1" : "0")
    },
    [key],
  )
  return [value, set] as const
}

export const DOCK_OPEN_KEY = "humanity.terminalDock"
export const DOCK_HEIGHT_KEY = "humanity.terminalHeight"
export const RAIL_SHOWN_KEY = "humanity.rail"

export const DOCK_MIN_HEIGHT = 120
/** The chat keeps at least this much height above an open dock. */
export const CHAT_MIN_HEIGHT = 200
export const DOCK_DEFAULT_HEIGHT = 280

/**
 * Which terminal each owner (a thread, a project) showed last, for this page's life: going back
 * to it shows the same tab. Keyed by `terminalOwnerKey`.
 */
const activeTerminals = new Map<string, string>()

export const lastActiveTerminal = (ownerKey: string) => activeTerminals.get(ownerKey)
export const rememberActiveTerminal = (ownerKey: string, terminalId: string) =>
  void activeTerminals.set(ownerKey, terminalId)

/** The tab to show: the one asked for while it exists, else the last one. */
export const pickActive = (
  terminals: ReadonlyArray<{ readonly id: string }>,
  wanted: string | undefined,
): string | undefined =>
  terminals.find((terminal) => terminal.id === wanted)?.id ?? terminals.at(-1)?.id

/** The tab `step` places away from `current`, wrapping around. */
export const cycleTerminal = (
  terminals: ReadonlyArray<{ readonly id: string }>,
  current: string | undefined,
  step: 1 | -1,
): string | undefined => {
  if (terminals.length === 0) return undefined
  const index = terminals.findIndex((terminal) => terminal.id === current)
  const next = (Math.max(index, 0) + step + terminals.length) % terminals.length
  return terminals[next]?.id
}
