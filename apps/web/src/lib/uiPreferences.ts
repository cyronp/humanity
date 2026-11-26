import { useCallback, useSyncExternalStore } from "react"
import { readStored, writeStored } from "./storage.ts"

export const SEND_KEYS = ["enter", "mod-enter"] as const
export type SendKey = (typeof SEND_KEYS)[number]

export const INTERFACE_SCALES = [90, 100, 110, 125] as const
export type InterfaceScale = (typeof INTERFACE_SCALES)[number]

export const FETCH_INTERVALS = [0, 1, 5, 15, 30] as const
export type FetchInterval = (typeof FETCH_INTERVALS)[number]

export const CODE_THEMES = {
  github: { label: "GitHub", light: "github-light", dark: "github-dark" },
  one: { label: "One", light: "one-light", dark: "one-dark-pro" },
  vitesse: { label: "Vitesse", light: "vitesse-light", dark: "vitesse-dark" },
  catppuccin: { label: "Catppuccin", light: "catppuccin-latte", dark: "catppuccin-mocha" },
  solarized: { label: "Solarized", light: "solarized-light", dark: "solarized-dark" },
  min: { label: "Min", light: "min-light", dark: "min-dark" },
} as const
export type CodeThemeId = keyof typeof CODE_THEMES

export interface UiPreferences {
  readonly notifyWaiting: boolean
  readonly notifyFinished: boolean
  readonly notifyFailed: boolean
  readonly notifySound: boolean
  readonly sendKey: SendKey
  readonly expandThinking: boolean
  readonly expandToolCalls: boolean
  readonly interfaceScale: InterfaceScale
  readonly codeTheme: CodeThemeId
  readonly fetchMinutes: FetchInterval
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  notifyWaiting: false,
  notifyFinished: false,
  notifyFailed: false,
  notifySound: false,
  sendKey: "enter",
  expandThinking: false,
  expandToolCalls: false,
  interfaceScale: 100,
  codeTheme: "github",
  fetchMinutes: 5,
}

const STORAGE_KEY = "humanity.preferences"

const pick = <T>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback

export const parseUiPreferences = (raw: string | null): UiPreferences => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? "null")
  } catch {
    parsed = null
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_UI_PREFERENCES
  const record = parsed as Record<string, unknown>
  const fallback = DEFAULT_UI_PREFERENCES
  return {
    notifyWaiting: flag(record["notifyWaiting"], fallback.notifyWaiting),
    notifyFinished: flag(record["notifyFinished"], fallback.notifyFinished),
    notifyFailed: flag(record["notifyFailed"], fallback.notifyFailed),
    notifySound: flag(record["notifySound"], fallback.notifySound),
    sendKey: pick(record["sendKey"], SEND_KEYS, fallback.sendKey),
    expandThinking: flag(record["expandThinking"], fallback.expandThinking),
    expandToolCalls: flag(record["expandToolCalls"], fallback.expandToolCalls),
    interfaceScale: pick(record["interfaceScale"], INTERFACE_SCALES, fallback.interfaceScale),
    codeTheme: pick(
      record["codeTheme"],
      Object.keys(CODE_THEMES) as Array<CodeThemeId>,
      fallback.codeTheme,
    ),
    fetchMinutes: pick(record["fetchMinutes"], FETCH_INTERVALS, fallback.fetchMinutes),
  }
}

const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cached: UiPreferences = DEFAULT_UI_PREFERENCES
let memoryRaw: string | null = null

const readRaw = (): string | null => readStored(STORAGE_KEY) ?? memoryRaw

export const uiPreferences = (): UiPreferences => {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parseUiPreferences(raw)
  }
  return cached
}

export const applyInterfaceScale = (): void => {
  const scale = uiPreferences().interfaceScale
  document.documentElement.style.fontSize = scale === 100 ? "" : `${scale}%`
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      applyInterfaceScale()
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export const setUiPreferences = (patch: Partial<UiPreferences>): void => {
  const next = { ...uiPreferences(), ...patch }
  memoryRaw = JSON.stringify(next)
  writeStored(STORAGE_KEY, memoryRaw)
  applyInterfaceScale()
  listeners.forEach((listener) => listener())
}

export const useUiPreferences = (): readonly [
  UiPreferences,
  (patch: Partial<UiPreferences>) => void,
] => {
  const preferences = useSyncExternalStore(subscribe, uiPreferences)
  const change = useCallback((patch: Partial<UiPreferences>) => setUiPreferences(patch), [])
  return [preferences, change]
}
