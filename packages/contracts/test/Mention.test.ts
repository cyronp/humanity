import { describe, expect, it } from "vitest"
import { MENTION_LIMIT, mentionedPaths } from "../src/domain/Mention.ts"

describe("mentionedPaths", () => {
  it("keeps the picked paths the text still mentions, once each", () => {
    expect(
      mentionedPaths("see @src/a.ts and @src/a.ts, then @docs/.", ["src/a.ts", "docs/", "gone.ts"]),
    ).toEqual(["src/a.ts", "docs/"])
  })

  it("reads quoted paths and ignores an @ inside a word", () => {
    expect(mentionedPaths('@"my notes/a b.md" or me@a.ts', ["my notes/a b.md", "a.ts"])).toEqual([
      "my notes/a b.md",
    ])
  })

  it("keeps at most MENTION_LIMIT paths", () => {
    const paths = Array.from({ length: MENTION_LIMIT + 5 }, (_, index) => `f${index}.ts`)
    expect(mentionedPaths(paths.map((path) => `@${path}`).join(" "), paths)).toHaveLength(
      MENTION_LIMIT,
    )
  })
})
