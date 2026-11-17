import { describe, expect, it } from "vitest"
import { completeMention, findMention, mentionOf } from "@/features/chat/fileMention"

describe("finding the `@` being typed", () => {
  it("finds an `@` at the start or after whitespace, up to the caret", () => {
    expect(findMention("@", 1)).toEqual({ start: 0, query: "" })
    expect(findMention("look at @src/ind", 16)).toEqual({ start: 8, query: "src/ind" })
    expect(findMention("one\n@two", 8)).toEqual({ start: 4, query: "two" })
  })

  it("reads only up to the caret", () => {
    expect(findMention("@src/index.ts rest", 4)).toEqual({ start: 0, query: "src" })
  })

  it("ignores an e-mail address, a finished word and a lone word", () => {
    expect(findMention("me@host", 7)).toBeUndefined()
    expect(findMention("@src done", 9)).toBeUndefined()
    expect(findMention("plain", 5)).toBeUndefined()
  })
})

describe("writing a picked file", () => {
  it("names a file as @path, and quotes a path with whitespace", () => {
    expect(mentionOf({ path: "src/a.ts", kind: "file" })).toBe("@src/a.ts")
    expect(mentionOf({ path: "docs", kind: "directory" })).toBe("@docs/")
    expect(mentionOf({ path: "my docs/a b.md", kind: "file" })).toBe('@"my docs/a b.md"')
  })

  it("replaces the query with the file and a space, keeping the rest", () => {
    const text = "see @ind and more"
    expect(
      completeMention(text, { start: 4, query: "ind" }, 8, { path: "src/index.ts", kind: "file" }),
    ).toEqual({
      text: "see @src/index.ts and more",
      caret: 18,
    })
  })

  it("adds a space at the end of the text", () => {
    expect(
      completeMention("@a", { start: 0, query: "a" }, 2, { path: "a.ts", kind: "file" }),
    ).toEqual({
      text: "@a.ts ",
      caret: 6,
    })
  })

  it("leaves a folder open, so its contents are offered next", () => {
    expect(
      completeMention("@sr", { start: 0, query: "sr" }, 3, { path: "src", kind: "directory" }),
    ).toEqual({
      text: "@src/",
      caret: 5,
    })
  })
})
