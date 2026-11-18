import type { BranchPublication, WorkingTreeDiff } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { DEFAULT_SHELF, parseShelf, shelfBadges, toggleTool } from "@/features/session/panel/shelf"

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
    expect(parseShelf(JSON.stringify({ open: true, tool: "commits" }))).toEqual({
      open: true,
      tool: "commits",
    })
    expect(parseShelf(JSON.stringify({ open: "yes", tool: "terminal" }))).toEqual(DEFAULT_SHELF)
    expect(parseShelf("{not json")).toEqual(DEFAULT_SHELF)
    expect(parseShelf(null)).toEqual(DEFAULT_SHELF)
  })

  it("opens a tool, switches between tools, and closes on the open one", () => {
    const opened = toggleTool(DEFAULT_SHELF, "commits")
    expect(opened).toEqual({ open: true, tool: "commits" })
    expect(toggleTool(opened, "pull-request")).toEqual({ open: true, tool: "pull-request" })
    expect(toggleTool(opened, "commits")).toEqual({ open: false, tool: "commits" })
  })

  it("badges changed files and commits waiting for a push", () => {
    expect(shelfBadges(diff(3), publication({ ahead: 2 }))).toEqual({ changes: 3, commit: 2 })
    expect(shelfBadges(diff(0), publication({ ahead: 0 }))).toEqual({})
    expect(shelfBadges(undefined, publication({ upstream: null, ahead: 4 }))).toEqual({})
  })
})
