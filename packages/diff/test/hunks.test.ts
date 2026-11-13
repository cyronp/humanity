import { describe, expect, it } from "vitest"
import { changeKind, computeHunks, hunkHeader } from "../src/index.ts"

const lines = (count: number, prefix = "line") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`)

const text = (rows: ReadonlyArray<string>, eol = "\n") => rows.map((row) => row + eol).join("")

/** A file with three well-separated edits, which yields three hunks. */
const threeEdits = (eol = "\n") => {
  const before = lines(40)
  const after = [...before]
  after[2] = "CHANGED 3"
  after.splice(20, 1) // delete line 21
  after.splice(34, 0, "INSERTED a", "INSERTED b")
  return { original: text(before, eol), proposed: text(after, eol) }
}

describe("computeHunks", () => {
  it("returns no hunks for identical content", () => {
    expect(computeHunks("same\n", "same\n")).toEqual([])
    expect(computeHunks("", "")).toEqual([])
  })

  it("produces one pending hunk for a single change", () => {
    const hunks = computeHunks("a\nb\nc\n", "a\nB\nc\n")
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      id: "hunk-1",
      index: 1,
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 3,
      status: "pending",
      lines: [" a", "-b", "+B", " c"],
    })
  })

  it("splits distant changes into separate hunks with 1-based indexes", () => {
    const { original, proposed } = threeEdits()
    const hunks = computeHunks(original, proposed)
    expect(hunks.map((hunk) => hunk.index)).toEqual([1, 2, 3])
    expect(hunks.map((hunk) => hunk.id)).toEqual(["hunk-1", "hunk-2", "hunk-3"])
    expect(hunks[0]?.oldStart).toBe(1)
    expect(hunks[1]?.oldStart).toBe(18)
    expect(hunks[2]?.oldStart).toBe(33)
  })

  it("merges changes whose context overlaps into one hunk", () => {
    const before = lines(12)
    const after = [...before]
    after[3] = "X"
    after[6] = "Y"
    expect(computeHunks(text(before), text(after))).toHaveLength(1)
  })

  it("honors the context and idPrefix options", () => {
    const before = lines(12)
    const after = [...before]
    after[3] = "X"
    after[6] = "Y"
    const hunks = computeHunks(text(before), text(after), { context: 0, idPrefix: "chg" })
    expect(hunks).toHaveLength(2)
    expect(hunks.map((hunk) => hunk.id)).toEqual(["chg-1", "chg-2"])
    expect(hunks[0]?.lines).toEqual(["-line 4", "+X"])
  })

  it("describes a new file as a single all-additions hunk", () => {
    const hunks = computeHunks("", "first\nsecond\n")
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({ oldLines: 0, newStart: 1, newLines: 2 })
    expect(hunks[0] && hunkHeader(hunks[0])).toBe("@@ -0,0 +1,2 @@")
    expect(hunks[0]?.lines).toEqual(["+first", "+second"])
  })

  it("describes emptying a file as a single all-removals hunk", () => {
    const hunks = computeHunks("first\nsecond\n", "")
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.lines).toEqual(["-first", "-second"])
    expect(hunks[0] && hunkHeader(hunks[0])).toBe("@@ -1,2 +0,0 @@")
  })
})

describe("changeKind", () => {
  it("distinguishes creating from modifying", () => {
    expect(changeKind(false)).toBe("create")
    expect(changeKind(true)).toBe("modify")
  })
})

describe("hunkHeader", () => {
  it("prints the unified diff range header", () => {
    const [hunk] = computeHunks("a\nb\nc\n", "a\nB\nc\nd\n")
    expect(hunk && hunkHeader(hunk)).toBe("@@ -1,3 +1,4 @@")
  })
})
