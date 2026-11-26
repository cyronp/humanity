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
  } catch {}
}

export const parseFlag = (raw: string | null, fallback: boolean): boolean =>
  raw === "1" ? true : raw === "0" ? false : fallback

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
export const CHAT_MIN_HEIGHT = 200

const activeTerminals = new Map<string, string>()

export const lastActiveTerminal = (ownerKey: string) => activeTerminals.get(ownerKey)
export const rememberActiveTerminal = (ownerKey: string, terminalId: string) =>
  void activeTerminals.set(ownerKey, terminalId)

export const pickActive = (
  terminals: ReadonlyArray<{ readonly id: string }>,
  wanted: string | undefined,
): string | undefined =>
  terminals.find((terminal) => terminal.id === wanted)?.id ?? terminals.at(-1)?.id

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
