import { describe, expect, it } from "vitest"
import { trimCharacters, trimTrailing } from "../src/text.ts"

describe("trimTrailing", () => {
  it("drops any of the characters from the end only", () => {
    expect(trimTrailing("--a-b--", "-")).toBe("--a-b")
    expect(trimTrailing("a.ts!?)", ".,;:!?)")).toBe("a.ts")
    expect(trimTrailing("///", "/")).toBe("")
    expect(trimTrailing("abc", "")).toBe("abc")
  })

  it("runs in linear time on a long run that does not reach the end", () => {
    const started = performance.now()
    expect(trimTrailing(`${"-".repeat(200_000)}x`, "-")).toHaveLength(200_001)
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe("trimCharacters", () => {
  it("drops any of the characters from both ends", () => {
    expect(trimCharacters("--a-b--", "-")).toBe("a-b")
    expect(trimCharacters("\\/root/\\", "\\/")).toBe("root")
    expect(trimCharacters("----", "-")).toBe("")
  })

  it("runs in linear time on long runs at both ends", () => {
    const started = performance.now()
    const run = "-".repeat(200_000)
    expect(trimCharacters(`${run}x${run}`, "-")).toBe("x")
    expect(performance.now() - started).toBeLessThan(500)
  })
})
