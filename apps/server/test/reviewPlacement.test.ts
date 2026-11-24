import { describe, expect, it } from "vitest"
import type { FileDiff } from "@humanity/contracts"
import { placeReviewComments } from "../src/services/reviewPlacement.ts"

const file: FileDiff = {
  filePath: "src/login.ts",
  previousPath: "src/auth.ts",
  kind: "rename",
  binary: false,
  hunks: [
    {
      index: 1,
      oldStart: 10,
      oldLines: 3,
      newStart: 10,
      newLines: 3,
      lines: [" keep", "-old line", "+new line", " tail"],
    },
  ],
}

const comment = (side: "new" | "old", line: number, path = "src/login.ts") => ({
  path,
  side,
  line,
  body: " Why? ",
})

describe("placeReviewComments", () => {
  it("finds each comment's line in the diff, with both sides' numbers", () => {
    const { placed, missing } = placeReviewComments(
      [file],
      [comment("new", 10), comment("old", 11), comment("new", 11)],
    )
    expect(missing).toEqual([])
    expect(placed).toEqual([
      {
        path: "src/login.ts",
        previousPath: "src/auth.ts",
        side: "new",
        line: 10,
        oldLine: 10,
        newLine: 10,
        body: "Why?",
      },
      {
        path: "src/login.ts",
        previousPath: "src/auth.ts",
        side: "old",
        line: 11,
        oldLine: 11,
        newLine: undefined,
        body: "Why?",
      },
      {
        path: "src/login.ts",
        previousPath: "src/auth.ts",
        side: "new",
        line: 11,
        oldLine: undefined,
        newLine: 11,
        body: "Why?",
      },
    ])
  })

  it("names the comments on lines the diff does not show", () => {
    const { placed, missing } = placeReviewComments(
      [file],
      [comment("new", 40), comment("old", 10), comment("new", 10, "src/other.ts")],
    )
    expect(placed).toEqual([])
    expect(missing.map((each) => `${each.path}:${each.side}:${each.line}`)).toEqual([
      "src/login.ts:new:40",
      "src/login.ts:old:10",
      "src/other.ts:new:10",
    ])
  })
})
