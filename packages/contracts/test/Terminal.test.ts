import { describe, expect, it } from "vitest"
import { terminalLabel } from "../src/domain/Terminal.ts"

describe("terminalLabel", () => {
  it("names a terminal by its title, else its folder, else its number", () => {
    expect(terminalLabel({ title: "dev server", cwd: "C:\\repo", ordinal: 1 })).toBe("dev server")
    expect(terminalLabel({ title: null, cwd: "/home/me/repo/", ordinal: 2 })).toBe("repo")
    expect(terminalLabel({ title: null, cwd: "C:\\Users\\me\\repo\\\\", ordinal: 3 })).toBe("repo")
    expect(terminalLabel({ title: " ", cwd: "/", ordinal: 4 })).toBe("Terminal 4")
  })

  it("runs in linear time on a folder of many slashes", () => {
    const started = performance.now()
    terminalLabel({
      title: null,
      cwd: `a${"/".repeat(200_000)}b${"/".repeat(200_000)}`,
      ordinal: 1,
    })
    expect(performance.now() - started).toBeLessThan(500)
  })
})
