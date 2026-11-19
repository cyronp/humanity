import type { TerminalColors } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { colorReplies } from "../src/terminal/screen.ts"

const colors: TerminalColors = {
  foreground: "#0a0a0a",
  background: "#ffffff",
  cursor: "#123456",
  ansi: ["#000000", "#cd3131", ...Array.from({ length: 14 }, () => "#808080")],
}

const osc = (body: string) => `\x1b]${body}\x1b\\`

describe("colorReplies", () => {
  it("answers foreground, background and cursor queries as xterm does", () => {
    expect(colorReplies(10, "?", colors)).toBe(osc("10;rgb:0a0a/0a0a/0a0a"))
    expect(colorReplies(11, "?", colors)).toBe(osc("11;rgb:ffff/ffff/ffff"))
    expect(colorReplies(12, "?", colors)).toBe(osc("12;rgb:1212/3434/5656"))
  })

  it("answers each query of a list, after the color it names", () => {
    expect(colorReplies(10, "?;?", colors)).toBe(
      osc("10;rgb:0a0a/0a0a/0a0a") + osc("11;rgb:ffff/ffff/ffff"),
    )
    expect(colorReplies(10, "#ff0000;?", colors)).toBe(osc("11;rgb:ffff/ffff/ffff"))
    expect(colorReplies(12, "?;?", colors)).toBe(osc("12;rgb:1212/3434/5656"))
  })

  it("answers palette queries from the dock's 16 colors, then xterm's 256", () => {
    expect(colorReplies(4, "1;?", colors)).toBe(osc("4;1;rgb:cdcd/3131/3131"))
    expect(colorReplies(4, "16;?;231;?", colors)).toBe(
      osc("4;16;rgb:0000/0000/0000") + osc("4;231;rgb:ffff/ffff/ffff"),
    )
    expect(colorReplies(4, "232;?;255;?", colors)).toBe(
      osc("4;232;rgb:0808/0808/0808") + osc("4;255;rgb:eeee/eeee/eeee"),
    )
    expect(colorReplies(4, "256;?;1;#ffffff", colors)).toBe("")
  })

  it("answers nothing to a color being set, or before the dock said its colors", () => {
    expect(colorReplies(11, "#000000", colors)).toBe("")
    expect(colorReplies(11, "?", undefined)).toBe("")
  })
})
