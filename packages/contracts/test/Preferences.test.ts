import { describe, expect, it } from "vitest"
import { isBranchPrefix, newThreadAutonomy, NO_PINS, togglePin } from "../src/index.ts"

describe("newThreadAutonomy", () => {
  it("is Auto mode when nothing says otherwise", () => {
    expect(newThreadAutonomy(undefined, NO_PINS)).toBe("auto")
    expect(newThreadAutonomy({ defaultAutonomy: null }, NO_PINS)).toBe("auto")
  })

  it("follows the human's pin, and the project's own default over it", () => {
    const pinned = { autonomy: "ask" as const }
    expect(newThreadAutonomy({ defaultAutonomy: null }, pinned)).toBe("ask")
    expect(newThreadAutonomy({ defaultAutonomy: "accept_edits" }, pinned)).toBe("accept_edits")
    expect(newThreadAutonomy({ defaultAutonomy: "auto" }, pinned)).toBe("auto")
  })
})

describe("togglePin", () => {
  it("keeps one pin per setting: pinning another moves it, pinning it again removes it", () => {
    const first = togglePin(NO_PINS, "autonomy", "auto")
    expect(first).toEqual({ autonomy: "auto", effort: null, model: null })
    const moved = togglePin(first, "autonomy", "accept_edits")
    expect(moved.autonomy).toBe("accept_edits")
    expect(togglePin(moved, "autonomy", "accept_edits")).toEqual(NO_PINS)
  })

  it("pins the two settings independently", () => {
    const pinned = togglePin(togglePin(NO_PINS, "autonomy", "ask"), "effort", "high")
    expect(pinned).toEqual({ autonomy: "ask", effort: "high", model: null })
    expect(togglePin(pinned, "effort", "high")).toEqual({
      autonomy: "ask",
      effort: null,
      model: null,
    })
  })

  it("pins and unpins the model's own default effort", () => {
    const pinned = togglePin(NO_PINS, "effort", "default")
    expect(pinned.effort).toBe("default")
    expect(togglePin(pinned, "effort", "default").effort).toBeNull()
  })
})

describe("ProjectSettings", () => {
  it("accepts branch prefixes git can name a branch with, and refuses the rest", () => {
    for (const prefix of ["", "humanity/", "feat/", "me-", "team.a/x/"]) {
      expect(isBranchPrefix(prefix), prefix).toBe(true)
    }
    for (const prefix of ["/x", "a..b/", "a//b", ".hidden/", "a/.b", "x.lock/", "a b/", "~x"]) {
      expect(isBranchPrefix(prefix), prefix).toBe(false)
    }
  })
})
