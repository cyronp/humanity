import { describe, expect, it } from "vitest"
import {
  formatPartialApplicationMessage,
  formatRejectionMessage,
  type Hunk,
  type HunkStatus,
} from "../src/index.ts"

const hunk = (index: number, status: HunkStatus, comment?: string): Hunk => ({
  id: `hunk-${index}`,
  index,
  oldStart: index * 10,
  oldLines: 1,
  newStart: index * 10,
  newLines: 1,
  lines: ["-old", "+new"],
  status,
  ...(comment === undefined ? {} : { comment }),
})

describe("formatPartialApplicationMessage", () => {
  it("produces exactly the message from the spec", () => {
    const message = formatPartialApplicationMessage("src/app.ts", [
      hunk(1, "approved"),
      hunk(2, "rejected", "Keep the old validation, it's used by the CLI"),
      hunk(3, "approved"),
    ])
    expect(message).toBe(
      [
        "PARTIALLY APPLIED by the human reviewer to src/app.ts.",
        'Applied: hunks 1, 3. Rejected: hunk 2 — "Keep the old validation, it\'s used by the CLI".',
        "The file on disk now differs from what you proposed. Re-read it before making further edits.",
      ].join("\n"),
    )
  })

  it("uses the singular for one applied hunk and lists every rejection", () => {
    const message = formatPartialApplicationMessage("lib/a.ts", [
      hunk(1, "rejected", "wrong name"),
      hunk(2, "approved"),
      hunk(3, "rejected"),
    ])
    expect(message.split("\n")[1]).toBe(
      'Applied: hunk 2. Rejected: hunk 1 — "wrong name"; hunk 3 (no comment).',
    )
  })

  it("keeps the three-line shape when a comment spans several lines", () => {
    const message = formatPartialApplicationMessage("a.ts", [
      hunk(1, "approved"),
      hunk(2, "rejected", "first line\n\n  second line\t"),
    ])
    expect(message.split("\n")).toHaveLength(3)
    expect(message).toContain('hunk 2 — "first line second line"')
  })

  it("treats a blank comment as no comment", () => {
    const message = formatPartialApplicationMessage("a.ts", [
      hunk(1, "approved"),
      hunk(2, "rejected", "   "),
    ])
    expect(message).toContain("Rejected: hunk 2 (no comment).")
  })

  it("always tells the agent the file differs and must be re-read", () => {
    const message = formatPartialApplicationMessage("a.ts", [
      hunk(1, "approved"),
      hunk(2, "rejected"),
    ])
    expect(message.startsWith("PARTIALLY APPLIED")).toBe(true)
    expect(message).toMatch(/differs from what you proposed/)
    expect(message).toMatch(/Re-read it/)
  })

  it("refuses to describe a full approval or a full rejection as partial", () => {
    expect(() =>
      formatPartialApplicationMessage("a.ts", [hunk(1, "approved"), hunk(2, "approved")]),
    ).toThrow()
    expect(() =>
      formatPartialApplicationMessage("a.ts", [hunk(1, "rejected"), hunk(2, "rejected")]),
    ).toThrow()
  })
})

describe("formatRejectionMessage", () => {
  it("says nothing was applied and combines the comments per hunk", () => {
    const message = formatRejectionMessage("src/app.ts", [
      hunk(1, "rejected", "Don't rename this"),
      hunk(2, "rejected"),
    ])
    expect(message).toBe(
      [
        "REJECTED by the human reviewer: no part of your change to src/app.ts was applied.",
        'Rejected: hunk 1 — "Don\'t rename this"; hunk 2 (no comment).',
        "The file on disk is unchanged. Address the feedback before proposing another edit.",
      ].join("\n"),
    )
  })
})
