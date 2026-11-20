import type { TerminalColors } from "@humanity/contracts"
import type { ITheme } from "@xterm/xterm"
import { useSyncExternalStore } from "react"

export type ResolvedTheme = "light" | "dark"

const subscribe = (listener: () => void) => {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-color-theme"],
  })
  return () => observer.disconnect()
}

const current = (): ResolvedTheme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light"

export const useResolvedTheme = (): ResolvedTheme => useSyncExternalStore(subscribe, current)

const appliedColorTheme = (): string => document.documentElement.dataset.colorTheme ?? ""

export const useAppliedColorTheme = (): string => useSyncExternalStore(subscribe, appliedColorTheme)

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

export const rgbaToHex = (r: number, g: number, b: number, a = 255) =>
  `#${hex(r)}${hex(g)}${hex(b)}${a === 255 ? "" : hex(a)}`

let probe: CanvasRenderingContext2D | null | undefined

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

const ANSI_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const satisfies ReadonlyArray<keyof Palette>

export const terminalColors = (theme: ITheme): TerminalColors => {
  const opaque = (color: string | undefined, fallback: string) =>
    /^#[0-9a-f]{6}/i.test(color ?? "") ? (color as string).slice(0, 7) : fallback
  const foreground = opaque(theme.foreground, "#ffffff")
  return {
    foreground,
    background: opaque(theme.background, "#000000"),
    cursor: opaque(theme.cursor, foreground),
    ansi: ANSI_NAMES.map((name) => opaque(theme[name], "#000000")),
  }
}

const NERD_FONTS = [
  "JetBrainsMono Nerd Font Mono",
  "JetBrainsMono NFM",
  "JetBrainsMono Nerd Font",
  "JetBrainsMono NF",
  "CaskaydiaMono Nerd Font Mono",
  "CaskaydiaCove Nerd Font Mono",
  "CaskaydiaCove Nerd Font",
  "MesloLGS Nerd Font Mono",
  "MesloLGS NF",
  "FiraCode Nerd Font Mono",
  "FiraCode Nerd Font",
  "Hack Nerd Font Mono",
  "Hack Nerd Font",
]

const SYSTEM_FONTS = [
  "ui-monospace",
  "Cascadia Mono",
  "Cascadia Code",
  "SFMono-Regular",
  "Menlo",
  "Monaco",
  "Consolas",
  "Liberation Mono",
]

export const TERMINAL_FONT_FAMILY = [
  ...NERD_FONTS,
  ...SYSTEM_FONTS,
  "Symbols Nerd Font Mono",
  "monospace",
]
  .map((family) => (family.includes(" ") ? `"${family}"` : family))
  .join(", ")
