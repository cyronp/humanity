import type { ITheme } from "@xterm/xterm"
import { useSyncExternalStore } from "react"

export type ResolvedTheme = "light" | "dark"

const subscribe = (listener: () => void) => {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

const current = (): ResolvedTheme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light"

/** The theme the page shows now, following the human's choice and the system's. */
export const useResolvedTheme = (): ResolvedTheme => useSyncExternalStore(subscribe, current)

type Palette = Pick<
  ITheme,
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightBlack"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite"
>

/** ANSI colors readable on the page's own light and dark backgrounds. */
export const PALETTES: Readonly<Record<ResolvedTheme, Palette>> = {
  light: {
    black: "#000000",
    red: "#cd3131",
    green: "#107c10",
    yellow: "#949800",
    blue: "#0451a5",
    magenta: "#bc05bc",
    cyan: "#0598bc",
    white: "#555555",
    brightBlack: "#666666",
    brightRed: "#cd3131",
    brightGreen: "#14ce14",
    brightYellow: "#b5ba00",
    brightBlue: "#0451a5",
    brightMagenta: "#bc05bc",
    brightCyan: "#0598bc",
    brightWhite: "#a5a5a5",
  },
  dark: {
    black: "#000000",
    red: "#f14c4c",
    green: "#23d18b",
    yellow: "#f5f543",
    blue: "#3b8eea",
    magenta: "#d670d6",
    cyan: "#29b8db",
    white: "#e5e5e5",
    brightBlack: "#666666",
    brightRed: "#f14c4c",
    brightGreen: "#23d18b",
    brightYellow: "#f5f543",
    brightBlue: "#3b8eea",
    brightMagenta: "#d670d6",
    brightCyan: "#29b8db",
    brightWhite: "#ffffff",
  },
}

const hex = (value: number) => value.toString(16).padStart(2, "0")

/** `#rrggbb` for four bytes of RGBA, with the alpha kept only when it is not opaque. */
export const rgbaToHex = (r: number, g: number, b: number, a = 255) =>
  `#${hex(r)}${hex(g)}${hex(b)}${a === 255 ? "" : hex(a)}`

let probe: CanvasRenderingContext2D | null | undefined

/**
 * Any CSS color (the page's are oklch) as `#rrggbb`, which xterm needs; painted on a one-pixel
 * canvas and read back, since a computed style may keep the color in the space it was written in.
 */
export const cssColorToHex = (color: string, fallback: string): string => {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (probe === null || color.trim() === "") return fallback
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = fallback
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 255] = probe.getImageData(0, 0, 1, 1).data
  return rgbaToHex(r, g, b, a)
}

/** xterm's colors for the page's theme, read from the CSS variables where the terminal sits. */
export const terminalTheme = (element: Element, theme: ResolvedTheme): ITheme => {
  const style = getComputedStyle(element)
  const variable = (name: string, fallback: string) =>
    cssColorToHex(style.getPropertyValue(name), fallback)
  const background = variable("--background", theme === "dark" ? "#030303" : "#ffffff")
  const foreground = variable("--foreground", theme === "dark" ? "#fafafa" : "#0a0a0a")
  return {
    ...PALETTES[theme],
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: theme === "dark" ? "#ffffff40" : "#00000026",
    scrollbarSliderBackground: theme === "dark" ? "#ffffff26" : "#0000001f",
    scrollbarSliderHoverBackground: theme === "dark" ? "#ffffff40" : "#00000033",
    scrollbarSliderActiveBackground: theme === "dark" ? "#ffffff59" : "#00000047",
  }
}

export const TERMINAL_FONT_FAMILY =
  'ui-monospace, "Cascadia Mono", "Cascadia Code", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
