import { useCallback, useSyncExternalStore } from "react"
import {
  COLOR_THEME_TOKENS,
  type ColorThemeId,
  colorTheme,
  DEFAULT_COLOR_THEME,
  parseColorTheme,
} from "./colorThemes.ts"

export type Theme = "light" | "dark"

const STORAGE_KEY = "humanity.theme"
const COLOR_THEME_KEY = "humanity.colorTheme"
const listeners = new Set<() => void>()

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStored = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {}
}

const storedTheme = (): Theme | undefined => {
  const value = readStored(STORAGE_KEY)
  return value === "light" || value === "dark" ? value : undefined
}

const currentTheme = (): Theme => storedTheme() ?? systemTheme()

const currentColorTheme = (): ColorThemeId => parseColorTheme(readStored(COLOR_THEME_KEY))

export const applyTheme = (): void => {
  const theme = currentTheme()
  const id = currentColorTheme()
  const mode = colorTheme(id)[theme]
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.dataset.colorTheme = id
  for (const token of COLOR_THEME_TOKENS) root.style.setProperty(`--${token}`, mode.tokens[token])
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode.themeColor)
}

const notify = () => {
  applyTheme()
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const onSystemChange = () => {
    applyTheme()
    listener()
  }
  media.addEventListener("change", onSystemChange)
  return () => {
    listeners.delete(listener)
    media.removeEventListener("change", onSystemChange)
  }
}

export type ThemeChoice = Theme | "system"

const currentChoice = (): ThemeChoice => storedTheme() ?? "system"

export const useThemeChoice = (): readonly [ThemeChoice, (next: ThemeChoice) => void] => {
  const choice = useSyncExternalStore(subscribe, currentChoice)
  const choose = useCallback((next: ThemeChoice) => {
    writeStored(STORAGE_KEY, next === "system" ? null : next)
    notify()
  }, [])
  return [choice, choose]
}

export const useResolvedTheme = (): Theme => useSyncExternalStore(subscribe, currentTheme)

export const useColorTheme = (): readonly [ColorThemeId, (next: ColorThemeId) => void] => {
  const id = useSyncExternalStore(subscribe, currentColorTheme)
  const choose = useCallback((next: ColorThemeId) => {
    writeStored(COLOR_THEME_KEY, next === DEFAULT_COLOR_THEME ? null : next)
    notify()
  }, [])
  return [id, choose]
}
