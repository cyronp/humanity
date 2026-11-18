import { describe, expect, it } from "vitest"
import { clampWidth, dragWidth, parseStoredWidth } from "@/lib/resize"

describe("resize", () => {
  it("keeps a width between its bounds, in whole pixels", () => {
    expect(clampWidth(300.4, 240, 520)).toBe(300)
    expect(clampWidth(100, 240, 520)).toBe(240)
    expect(clampWidth(900, 240, 520)).toBe(520)
  })

  it("lets the minimum win when the window leaves less room than it", () => {
    expect(clampWidth(400, 320, 200)).toBe(320)
  })

  it("grows a handle's element toward the edge it sits on", () => {
    expect(dragWidth(320, 40, "end", 240, 520)).toBe(360)
    expect(dragWidth(320, -40, "end", 240, 520)).toBe(280)
    expect(dragWidth(500, -40, "start", 320, 900)).toBe(540)
    expect(dragWidth(500, 400, "start", 320, 900)).toBe(320)
  })

  it("reads only a positive number back from storage", () => {
    expect(parseStoredWidth("360")).toBe(360)
    expect(parseStoredWidth(null)).toBeNull()
    expect(parseStoredWidth("wide")).toBeNull()
    expect(parseStoredWidth("-5")).toBeNull()
  })
})
