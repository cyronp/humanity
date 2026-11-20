import type { BranchPublication, WorkingTreeDiff } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_SHELF,
  parseGitView,
  parseShelf,
  shelfBadges,
  toggleTool,
} from "@/features/session/panel/shelf"

const publication = (patch: Partial<BranchPublication>): BranchPublication => ({
  forge: "github",
  branch: "feat/login",
  checkedOut: "feat/login",
  defaultBranch: "main",
  upstream: "origin/feat/login",
  ahead: 0,
  behind: 0,
  uncommitted: 0,
  ...patch,
})

const diff = (count: number): WorkingTreeDiff => ({
  base: "HEAD",
  files: Array.from({ length: count }, (_, index) => ({
    filePath: `file-${index}.ts`,
    kind: "modify",
    binary: false,
    hunks: [],
  })),
})

describe("shelf", () => {
  it("reads what it stored, and falls back on anything else", () => {
    expect(parseShelf(JSON.stringify({ open: true, tool: "browser" }))).toEqual({
      open: true,
      tool: "browser",
    })
    expect(parseShelf(JSON.stringify({ open: "yes", tool: "terminal" }))).toEqual(DEFAULT_SHELF)
    expect(parseShelf("{not json")).toEqual(DEFAULT_SHELF)
    expect(parseShelf(null)).toEqual(DEFAULT_SHELF)
  })

  it("opens Source control for any git tool the rail used to have", () => {
    for (const tool of ["changes", "commits", "commit", "pull-request"]) {
      expect(parseShelf(JSON.stringify({ open: true, tool }))).toEqual({ open: true, tool: "git" })
    }
  })

  it("opens a tool, switches between tools, and closes on the open one", () => {
    const opened = toggleTool(DEFAULT_SHELF, "git")
    expect(opened).toEqual({ open: true, tool: "git" })
    expect(toggleTool(opened, "browser")).toEqual({ open: true, tool: "browser" })
    expect(toggleTool(opened, "git")).toEqual({ open: false, tool: "git" })
  })

  it("remembers the Source control tab, and starts on Overview", () => {
    expect(parseGitView("commits")).toBe("commits")
    expect(parseGitView("pull-request")).toBe("overview")
    expect(parseGitView(null)).toBe("overview")
  })

  it("badges changed files, else commits waiting for a push", () => {
    expect(shelfBadges(diff(3), publication({ ahead: 2 }))).toEqual({
      git: { count: 3, label: "3 changed" },
    })
    expect(shelfBadges(diff(0), publication({ ahead: 2 }))).toEqual({
      git: { count: 2, label: "2 to push" },
    })
    expect(shelfBadges(diff(0), publication({ ahead: 0 }))).toEqual({})
    expect(shelfBadges(undefined, publication({ upstream: null, ahead: 4 }))).toEqual({})
  })
})
