import { useCallback, useSyncExternalStore } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "humanity.theme"
const listeners = new Set<() => void>()

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

const storedTheme = (): Theme | undefined => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" ? value : undefined
  } catch {
    return undefined
  }
}

const currentTheme = (): Theme => storedTheme() ?? systemTheme()

/** The page's background, as `--chat` in each theme. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = { light: "#fafafa", dark: "#171717" }

/**
 * shadcn and Shiki both key off the `dark` class on <html>. The theme colour
 * tells whatever frames the page, like the desktop app with its window
 * buttons, which side of the contrast it is on.
 */
export const applyTheme = (): void => {
  const theme = currentTheme()
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme])
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

/** A theme the human picked, or `system` to follow the operating system's. */
export type ThemeChoice = Theme | "system"

const currentChoice = (): ThemeChoice => storedTheme() ?? "system"

export const useThemeChoice = (): readonly [ThemeChoice, (next: ThemeChoice) => void] => {
  const choice = useSyncExternalStore(subscribe, currentChoice)
  const choose = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Without storage the choice lasts until reload.
    }
    applyTheme()
    listeners.forEach((listener) => listener())
  }, [])
  return [choice, choose]
}
