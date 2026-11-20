import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  COLOR_THEME_TOKENS,
  COLOR_THEMES,
  colorTheme,
  DEFAULT_COLOR_THEME,
  parseColorTheme,
} from "@/lib/colorThemes"

const cssBlock = (css: string, selector: string): Record<string, string> => {
  const start = css.indexOf(`\n${selector} {`)
  const body = css.slice(start, css.indexOf("\n}", start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]),
  )
}

describe("COLOR_THEMES", () => {
  it("gives each theme its own id and label", () => {
    expect(new Set(COLOR_THEMES.map((theme) => theme.id)).size).toBe(COLOR_THEMES.length)
    expect(new Set(COLOR_THEMES.map((theme) => theme.label)).size).toBe(COLOR_THEMES.length)
  })

  it("defines every token in both modes, with a hex theme color", () => {
    for (const theme of COLOR_THEMES) {
      for (const mode of [theme.light, theme.dark]) {
        expect(Object.keys(mode.tokens).sort()).toEqual([...COLOR_THEME_TOKENS].sort())
        expect(Object.values(mode.tokens).every((value) => value.trim() !== "")).toBe(true)
        expect(mode.themeColor).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it("keeps the default theme equal to the tokens of index.css", () => {
    const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
    const defaults = colorTheme(DEFAULT_COLOR_THEME)
    const pick = (block: Record<string, string>) =>
      Object.fromEntries(COLOR_THEME_TOKENS.map((token) => [token, block[token]]))
    expect(defaults.light.tokens).toEqual(pick(cssBlock(css, ":root")))
    expect(defaults.dark.tokens).toEqual(pick(cssBlock(css, ".dark")))
  })

  it("starts dark themes dark and light themes light, for the desktop title bar", () => {
    const luminance = (hex: string) => {
      const [red, green, blue] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
    }
    for (const theme of COLOR_THEMES) {
      expect(luminance(theme.light.themeColor)).toBeGreaterThan(0.5)
      expect(luminance(theme.dark.themeColor)).toBeLessThan(0.5)
    }
  })
})

describe("parseColorTheme", () => {
  it("reads a stored theme and falls back to the default for anything else", () => {
    expect(parseColorTheme("plum")).toBe("plum")
    expect(parseColorTheme(null)).toBe(DEFAULT_COLOR_THEME)
    expect(parseColorTheme("solarized")).toBe(DEFAULT_COLOR_THEME)
  })
})
