import { describe, expect, it } from "vitest"
import { NO_PINS, togglePin } from "../src/index.ts"

describe("togglePin", () => {
  it("keeps one pin per setting: pinning another moves it, pinning it again removes it", () => {
    const first = togglePin(NO_PINS, "autonomy", "auto")
    expect(first).toEqual({ autonomy: "auto", effort: null })
    const moved = togglePin(first, "autonomy", "accept_edits")
    expect(moved.autonomy).toBe("accept_edits")
    expect(togglePin(moved, "autonomy", "accept_edits")).toEqual(NO_PINS)
  })

  it("pins the two settings independently", () => {
    const pinned = togglePin(togglePin(NO_PINS, "autonomy", "ask"), "effort", "high")
    expect(pinned).toEqual({ autonomy: "ask", effort: "high" })
    expect(togglePin(pinned, "effort", "high")).toEqual({ autonomy: "ask", effort: null })
  })

  it("pins and unpins the model's own default effort", () => {
    const pinned = togglePin(NO_PINS, "effort", "default")
    expect(pinned.effort).toBe("default")
    expect(togglePin(pinned, "effort", "default").effort).toBeNull()
  })
})
