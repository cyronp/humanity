import { describe, expect, it } from "vitest"
import { completeMention, findMention, mentionOf, splitMentions } from "@/features/chat/fileMention"

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

describe("splitMentions", () => {
  const picked = (...paths: Array<string>) => new Set(paths)

  it("marks the files picked from the list among the text", () => {
    expect(splitMentions("look at @src/app.ts and @docs/", picked("src/app.ts", "docs/"))).toEqual([
      { kind: "text", text: "look at " },
      { kind: "file", text: "@src/app.ts", path: "src/app.ts" },
      { kind: "text", text: " and " },
      { kind: "file", text: "@docs/", path: "docs/" },
    ])
  })

  it("reads a quoted path with spaces", () => {
    expect(splitMentions('@"my notes/a b.md" please', picked("my notes/a b.md"))).toEqual([
      { kind: "file", text: '@"my notes/a b.md"', path: "my notes/a b.md" },
      { kind: "text", text: " please" },
    ])
  })

  it("leaves punctuation after a reference out of it", () => {
    expect(splitMentions("fix @a.ts, then @b.ts.", picked("a.ts", "b.ts"))).toEqual([
      { kind: "text", text: "fix " },
      { kind: "file", text: "@a.ts", path: "a.ts" },
      { kind: "text", text: ", then " },
      { kind: "file", text: "@b.ts", path: "b.ts" },
      { kind: "text", text: "." },
    ])
  })

  it("leaves as text an @ that was not picked, whatever it looks like", () => {
    expect(
      splitMentions("use @effect/vitest, ask @someone, see @Taskfile", picked("Taskfile")),
    ).toEqual([
      { kind: "text", text: "use @effect/vitest, ask @someone, see " },
      { kind: "file", text: "@Taskfile", path: "Taskfile" },
    ])
    expect(splitMentions("see @src/app.ts", picked())).toEqual([
      { kind: "text", text: "see @src/app.ts" },
    ])
  })

  it("ignores an @ inside a word and a lone @", () => {
    expect(splitMentions("mail a@b.com @ now", picked("b.com"))).toEqual([
      { kind: "text", text: "mail a@b.com @ now" },
    ])
  })

  it("keeps every character of the text", () => {
    const text = 'a @x.ts\n@"y z" @w. @q'
    expect(
      splitMentions(text, picked("x.ts", "y z", "w"))
        .map((segment) => segment.text)
        .join(""),
    ).toBe(text)
  })
})
