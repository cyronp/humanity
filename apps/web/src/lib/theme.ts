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

/** shadcn and Shiki both key off the `dark` class on <html>. */
export const applyTheme = (): void => {
  document.documentElement.classList.toggle("dark", currentTheme() === "dark")
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

export const useTheme = (): readonly [Theme, () => void] => {
  const theme = useSyncExternalStore(subscribe, currentTheme)
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark"
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Without storage the choice lasts until reload.
    }
    applyTheme()
    listeners.forEach((listener) => listener())
  }, [])
  return [theme, toggle]
}
