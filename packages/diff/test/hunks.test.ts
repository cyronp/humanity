import { describe, expect, it } from "vitest"
import {
  applyHunks,
  approvedIndexes,
  changeKind,
  computeHunks,
  type DiffHunk,
  type Hunk,
  HunkApplyError,
  hunkHeader,
  isFullyDecided,
  reviewOutcome,
  withDecisions,
} from "../src/index.ts"

const lines = (count: number, prefix = "line") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`)

const text = (rows: ReadonlyArray<string>, eol = "\n") => rows.map((row) => row + eol).join("")

/** Every subset of `[1..n]`. */
const subsets = (n: number): Array<Array<number>> =>
  Array.from({ length: 2 ** n }, (_, mask) =>
    Array.from({ length: n }, (_, bit) => bit + 1).filter((index) => mask & (1 << (index - 1))),
  )

/**
 * An independent oracle for partial application: splice each approved hunk's
 * new side over its old range, working bottom-up so earlier offsets stay valid.
 */
const referenceApply = (
  original: string,
  hunks: ReadonlyArray<DiffHunk>,
  approved: ReadonlyArray<number>,
) => {
  const rows = original.match(/[^\n]*\n|[^\n]+$/g) ?? []
  for (const hunk of [...hunks].reverse()) {
    if (!approved.includes(hunk.index)) continue
    const replacement: Array<string> = []
    hunk.lines.forEach((line, position) => {
      if (line.startsWith("-") || line.startsWith("\\")) return
      const unterminated = hunk.lines[position + 1]?.startsWith("\\") === true
      replacement.push(line.slice(1) + (unterminated ? "" : "\n"))
    })
    rows.splice(hunk.oldStart - 1, hunk.oldLines, ...replacement)
  }
  return rows.join("")
}

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

describe("applyHunks", () => {
  it("applying every hunk yields the proposed content", () => {
    const { original, proposed } = threeEdits()
    const hunks = computeHunks(original, proposed)
    expect(applyHunks(original, hunks, [1, 2, 3])).toBe(proposed)
  })

  it("applying no hunk yields the original content", () => {
    const { original, proposed } = threeEdits()
    expect(applyHunks(original, computeHunks(original, proposed), [])).toBe(original)
  })

  it("applies exactly the chosen hunks", () => {
    const { original, proposed } = threeEdits()
    const hunks = computeHunks(original, proposed)

    const onlyFirst = applyHunks(original, hunks, [1])
    expect(onlyFirst).toContain("CHANGED 3\n")
    expect(onlyFirst).toContain("line 21\n")
    expect(onlyFirst).not.toContain("INSERTED")

    const firstAndThird = applyHunks(original, hunks, [1, 3])
    expect(firstAndThird).toContain("CHANGED 3\n")
    expect(firstAndThird).toContain("line 21\n")
    expect(firstAndThird).toContain("INSERTED a\nINSERTED b\n")

    const onlySecond = applyHunks(original, hunks, [2])
    expect(onlySecond).toContain("line 3\n")
    expect(onlySecond).not.toContain("line 21\n")
  })

  it("matches the reference implementation for every subset", () => {
    const { original, proposed } = threeEdits()
    const hunks = computeHunks(original, proposed)
    for (const subset of subsets(hunks.length)) {
      expect(applyHunks(original, hunks, subset), `subset ${subset.join(",")}`).toBe(
        referenceApply(original, hunks, subset),
      )
    }
  })

  it("matches the reference for every subset of context-free hunks", () => {
    // Without context lines a pure insertion has an empty old range.
    const { original, proposed } = threeEdits()
    const hunks = computeHunks(original, proposed, { context: 0 })
    expect(hunks.some((hunk) => hunk.oldLines === 0)).toBe(true)
    for (const subset of subsets(hunks.length)) {
      expect(applyHunks(original, hunks, subset), `subset ${subset.join(",")}`).toBe(
        referenceApply(original, hunks, subset),
      )
    }
    expect(applyHunks(original, hunks, [1, 2, 3])).toBe(proposed)
  })

  it("ignores indexes that do not exist and accepts any iterable", () => {
    const { original, proposed } = threeEdits()
    const hunks = computeHunks(original, proposed)
    expect(applyHunks(original, hunks, new Set([99]))).toBe(original)
    expect(applyHunks(original, hunks, new Set([3, 2, 1]))).toBe(proposed)
  })

  it("matches the reference for every subset of randomly edited files", () => {
    // Deterministic pseudo-random edits: a small LCG keeps failures reproducible.
    let seed = 20261109
    const random = (max: number) => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32
      return seed % max
    }
    for (let round = 0; round < 60; round++) {
      const before = lines(30 + random(40))
      const after = [...before]
      for (let edit = 0; edit < 2 + random(5); edit++) {
        const at = random(after.length)
        const action = random(3)
        if (action === 0) after[at] = `edit ${round}.${edit}`
        else if (action === 1) after.splice(at, 1 + random(2))
        else after.splice(at, 0, `insert ${round}.${edit}`)
      }
      const original = text(before)
      const proposed = text(after)
      const hunks = computeHunks(original, proposed)
      // Cap the subset explosion; 6 hunks is 64 combinations per round.
      const considered = hunks.slice(0, 6)
      expect(
        applyHunks(
          original,
          hunks,
          hunks.map((h) => h.index),
        ),
      ).toBe(proposed)
      for (const subset of subsets(considered.length)) {
        expect(applyHunks(original, hunks, subset), `round ${round} subset ${subset}`).toBe(
          referenceApply(original, hunks, subset),
        )
      }
    }
  })

  it("creates a new file from its single hunk", () => {
    const proposed = "export const a = 1\nexport const b = 2\n"
    const hunks = computeHunks("", proposed)
    expect(applyHunks("", hunks, [1])).toBe(proposed)
    expect(applyHunks("", hunks, [])).toBe("")
  })

  it("empties a file when the removal hunk is approved", () => {
    const original = "a\nb\n"
    const hunks = computeHunks(original, "")
    expect(applyHunks(original, hunks, [1])).toBe("")
  })

  it("throws when the hunks were computed against different content", () => {
    const hunks = computeHunks("a\nb\nc\n", "a\nB\nc\n")
    expect(() => applyHunks("x\ny\nz\n", hunks, [1])).toThrow(HunkApplyError)
  })

  describe("trailing newlines", () => {
    it("adds a missing final newline", () => {
      const original = "a\nb"
      const proposed = "a\nb\n"
      const hunks = computeHunks(original, proposed)
      expect(hunks).toHaveLength(1)
      expect(hunks[0]?.lines).toContain("\\ No newline at end of file")
      expect(applyHunks(original, hunks, [1])).toBe(proposed)
      expect(applyHunks(original, hunks, [])).toBe(original)
    })

    it("removes a final newline", () => {
      const original = "a\nb\n"
      const proposed = "a\nb"
      const hunks = computeHunks(original, proposed)
      expect(applyHunks(original, hunks, [1])).toBe(proposed)
    })

    it("edits the last line of a file that has no final newline", () => {
      const original = "a\nb\nc"
      const proposed = "a\nb\nC"
      const hunks = computeHunks(original, proposed)
      expect(applyHunks(original, hunks, [1])).toBe(proposed)
    })

    it("keeps the original ending when only an earlier hunk is approved", () => {
      const before = lines(30)
      const after = [...before]
      after[1] = "CHANGED 2"
      after[29] = "CHANGED 30"
      const original = before.join("\n") // no final newline
      const proposed = after.join("\n") + "\n" // gains one
      const hunks = computeHunks(original, proposed)
      expect(hunks).toHaveLength(2)

      const onlyFirst = applyHunks(original, hunks, [1])
      expect(onlyFirst.endsWith("line 30")).toBe(true)
      expect(onlyFirst).toContain("CHANGED 2\n")

      const onlySecond = applyHunks(original, hunks, [2])
      expect(onlySecond.endsWith("CHANGED 30\n")).toBe(true)
      expect(onlySecond).toContain("line 2\n")

      for (const subset of subsets(2)) {
        expect(applyHunks(original, hunks, subset)).toBe(referenceApply(original, hunks, subset))
      }
    })

    it("appends lines to a file without a final newline", () => {
      const original = "a\nb"
      const proposed = "a\nb\nc\nd"
      const hunks = computeHunks(original, proposed)
      expect(applyHunks(original, hunks, [1])).toBe(proposed)
    })
  })

  describe("CRLF files", () => {
    it("round-trips a full approval byte for byte", () => {
      const { original, proposed } = threeEdits("\r\n")
      const hunks = computeHunks(original, proposed)
      expect(hunks).toHaveLength(3)
      expect(applyHunks(original, hunks, [1, 2, 3])).toBe(proposed)
    })

    it("keeps CRLF on every line for any subset", () => {
      const { original, proposed } = threeEdits("\r\n")
      const hunks = computeHunks(original, proposed)
      for (const subset of subsets(hunks.length)) {
        const result = applyHunks(original, hunks, subset)
        expect(result, `subset ${subset}`).toBe(referenceApply(original, hunks, subset))
        expect(result.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
      }
    })

    it("applies a change that converts a line from CRLF to LF as proposed", () => {
      const original = "a\r\nb\r\nc\r\n"
      const proposed = "a\r\nb\nc\r\n"
      const hunks = computeHunks(original, proposed)
      expect(hunks).toHaveLength(1)
      expect(applyHunks(original, hunks, [1])).toBe(proposed)
    })
  })
})

describe("decisions", () => {
  const hunks = (): Array<Hunk> => {
    const { original, proposed } = threeEdits()
    return computeHunks(original, proposed)
  }

  it("folds decisions into hunks and trims comments", () => {
    const decided = withDecisions(hunks(), [
      { index: 1, decision: "approved" },
      { index: 2, decision: "rejected", comment: "  keep this line  " },
    ])
    expect(decided.map((hunk) => hunk.status)).toEqual(["approved", "rejected", "pending"])
    expect(decided[1]?.comment).toBe("keep this line")
    expect(decided[0]).not.toHaveProperty("comment")
    expect(isFullyDecided(decided)).toBe(false)
  })

  it("drops a stale comment when a hunk is re-decided without one", () => {
    const first = withDecisions(hunks(), [{ index: 1, decision: "rejected", comment: "no" }])
    const second = withDecisions(first, [{ index: 1, decision: "approved" }])
    expect(second[0]).not.toHaveProperty("comment")
    expect(second[0]?.status).toBe("approved")
  })

  it("derives the outcome of a decided review", () => {
    const all = withDecisions(
      hunks(),
      [1, 2, 3].map((index) => ({ index, decision: "approved" as const })),
    )
    const none = withDecisions(
      hunks(),
      [1, 2, 3].map((index) => ({ index, decision: "rejected" as const })),
    )
    const some = withDecisions(hunks(), [
      { index: 1, decision: "approved" },
      { index: 2, decision: "rejected" },
      { index: 3, decision: "approved" },
    ])
    expect(reviewOutcome(all)).toBe("applied")
    expect(reviewOutcome(none)).toBe("rejected")
    expect(reviewOutcome(some)).toBe("partially_applied")
    expect(approvedIndexes(some)).toEqual([1, 3])
  })

  it("refuses to settle a review that still has pending hunks", () => {
    expect(() => reviewOutcome(hunks())).toThrow(/pending/)
  })
})

describe("hunkHeader", () => {
  it("prints the unified diff range header", () => {
    const [hunk] = computeHunks("a\nb\nc\n", "a\nB\nc\nd\n")
    expect(hunk && hunkHeader(hunk)).toBe("@@ -1,3 +1,4 @@")
  })
})
