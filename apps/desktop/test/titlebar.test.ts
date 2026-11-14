import { describe, expect, it } from "vitest"
import { isDarkColor, titleBarOverlay } from "../src/titlebar.ts"

describe("isDarkColor", () => {
  it.each([
    ["#171717", true],
    ["#000", true],
    ["#1e3a8a", true],
    ["#fafafa", false],
    ["#FFF", false],
    [" #fde047 ", false],
  ] as const)("%j is dark: %s", (color, dark) => {
    expect(isDarkColor(color)).toBe(dark)
  })

  it.each([null, "", "red", "rgb(0, 0, 0)", "#12345"])("does not guess at %j", (color) => {
    expect(isDarkColor(color)).toBeUndefined()
  })
})

describe("titleBarOverlay", () => {
  it("draws light symbols on a dark page and dark ones on a light page", () => {
    expect(titleBarOverlay(true).symbolColor).toBe("#fafafa")
    expect(titleBarOverlay(false).symbolColor).toBe("#171717")
  })
})
