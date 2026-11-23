import type { FileDiff } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { anchorOf } from "@/features/diff/HunkView"
import {
  formatReviewComments,
  type ReviewComment,
  reviewComments,
  staleComments,
} from "@/features/diff/reviewComments"

const comment = (
  id: string,
  path: string,
  line: number,
  body: string,
  side: "new" | "old" = "new",
  lineText = "const user = await load(id)",
): ReviewComment => ({ id, path, side, line, lineText, body })

const file: FileDiff = {
  filePath: "src/app.ts",
  kind: "modify",
  binary: false,
  hunks: [
    {
      index: 1,
      oldStart: 10,
      oldLines: 2,
      newStart: 10,
      newLines: 2,
      lines: [" const a = 1", "-const user = load(id)", "+const user = await load(id)"],
    },
  ],
} as unknown as FileDiff

describe("review comments", () => {
  it("anchors a comment to the new line, or to the old one for a removed line", () => {
    expect(anchorOf("a.ts", { kind: "add", text: "x", newNumber: 4 })).toEqual({
      path: "a.ts",
      side: "new",
      line: 4,
      lineText: "x",
    })
    expect(anchorOf("a.ts", { kind: "remove", text: "y", oldNumber: 7 })).toEqual({
      path: "a.ts",
      side: "old",
      line: 7,
      lineText: "y",
    })
    expect(anchorOf("a.ts", { kind: "meta", text: "\\ No newline" })).toBeUndefined()
  })

  it("writes them as one message, by file and line, quoting each line", () => {
    expect(
      formatReviewComments([
        comment("2", "src/b.ts", 3, "Rename this.", "old", "let x"),
        comment("1", "src/a.ts", 42, "  Handle the not-found case.  "),
      ]),
    ).toBe(
      [
        "My review comments on the uncommitted changes (2):",
        "src/a.ts, line 42:\n> const user = await load(id)\nHandle the not-found case.",
        "src/b.ts, removed line 3:\n> let x\nRename this.",
      ].join("\n\n"),
    )
  })

  it("finds the comments whose line is no longer in the diff", () => {
    const kept = comment("kept", "src/app.ts", 11, "ok")
    const moved = comment("moved", "src/app.ts", 12, "gone")
    const changed = comment("changed", "src/app.ts", 11, "text differs", "new", "other text")
    expect([...staleComments([file], [kept, moved, changed])]).toEqual(["moved", "changed"])
  })

  it("keeps working without browser storage", () => {
    const store = reviewComments("no-storage")
    store.add({ path: "a.ts", side: "new", line: 1, lineText: "x" }, "hi")
    store.clear()
  })
})
