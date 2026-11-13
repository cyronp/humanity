import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { expandHome, isSamePath } from "../src/paths.ts"

describe("expandHome", () => {
  it("starts ~ paths at the home directory", () => {
    expect(expandHome("~", "/home/me")).toBe("/home/me")
    expect(expandHome("~/.claude-personal", "/home/me")).toBe(join("/home/me", ".claude-personal"))
    expect(expandHome("~\\.claude-personal", "C:\\Users\\me")).toBe(
      join("C:\\Users\\me", ".claude-personal"),
    )
  })

  it("leaves every other path as given", () => {
    expect(expandHome("/srv/claude", "/home/me")).toBe("/srv/claude")
    expect(expandHome("~other/.claude", "/home/me")).toBe("~other/.claude")
  })
})

describe("isSamePath", () => {
  it("ignores a trailing separator and dot segments", () => {
    expect(isSamePath("/home/me/.claude/", "/home/me/x/../.claude", "linux")).toBe(true)
  })

  it("ignores case only where the file system does", () => {
    expect(isSamePath("/home/me/.Claude", "/home/me/.claude", "win32")).toBe(true)
    expect(isSamePath("/home/me/.Claude", "/home/me/.claude", "linux")).toBe(false)
  })
})
