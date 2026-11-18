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

  it("reads a path with an @ inside, and a quoted path with escaped quotes", () => {
    expect(
      mentionedPaths('@node/@types/a.ts and @"say \\"hi\\".md".', [
        "node/@types/a.ts",
        'say "hi".md',
      ]),
    ).toEqual(["node/@types/a.ts", 'say "hi".md'])
  })

  it("drops trailing punctuation in linear time", () => {
    const started = performance.now()
    expect(mentionedPaths(`@a.ts${"!".repeat(100_000)}x @b.ts!!!`, ["a.ts", "b.ts"])).toEqual([
      "b.ts",
    ])
    expect(performance.now() - started).toBeLessThan(500)
  })

  it("keeps at most MENTION_LIMIT paths", () => {
    const paths = Array.from({ length: MENTION_LIMIT + 5 }, (_, index) => `f${index}.ts`)
    expect(mentionedPaths(paths.map((path) => `@${path}`).join(" "), paths)).toHaveLength(
      MENTION_LIMIT,
    )
  })
})
