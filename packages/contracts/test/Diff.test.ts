import type * as Plain from "@humanity/diff"
import { describe, expectTypeOf, it } from "vitest"
import type { DiffHunk, FileDiff, Hunk, HunkStatus } from "../src/index.ts"

describe("diff schemas mirror @humanity/diff", () => {
  it("HunkStatus", () => {
    expectTypeOf<HunkStatus>().toEqualTypeOf<Plain.HunkStatus>()
  })

  it("DiffHunk", () => {
    expectTypeOf<DiffHunk>().toExtend<Plain.DiffHunk>()
    expectTypeOf<Plain.DiffHunk>().toExtend<DiffHunk>()
  })

  it("Hunk", () => {
    expectTypeOf<Hunk>().toExtend<Plain.Hunk>()
    expectTypeOf<Plain.Hunk>().toExtend<Hunk>()
  })

  it("FileDiff", () => {
    expectTypeOf<FileDiff>().toExtend<Plain.FileDiff>()
    expectTypeOf<Plain.FileDiff>().toExtend<FileDiff>()
  })
})
