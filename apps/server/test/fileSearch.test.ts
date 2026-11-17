import { describe, expect, it } from "vitest"
import { parseFileList, searchFiles } from "../src/services/fileSearch.ts"

const FILES = [
  "README.md",
  "package.json",
  "src/index.ts",
  "src/components/Button.tsx",
  "src/components/ButtonGroup.tsx",
  "src/features/chat/Composer.tsx",
  "test/button.test.ts",
]

const paths = (query: string, limit?: number) =>
  searchFiles(FILES, query, limit).map((entry) =>
    entry.kind === "directory" ? `${entry.path}/` : entry.path,
  )

describe("parseFileList", () => {
  it("splits NUL-separated paths and drops duplicates", () => {
    expect(parseFileList("a.ts\0b/c.ts\0a.ts\0")).toEqual(["a.ts", "b/c.ts"])
    expect(parseFileList("")).toEqual([])
  })
})

describe("searchFiles", () => {
  it("lists the top of the tree for an empty query, folders first", () => {
    expect(paths("", 4)).toEqual(["src/", "test/", "README.md", "package.json"])
  })

  it("derives every folder that holds a file", () => {
    expect(paths("features")).toEqual([
      "src/features/",
      "src/features/chat/",
      "src/features/chat/Composer.tsx",
    ])
  })

  it("ranks an exact name, then a name prefix, then a name substring", () => {
    expect(paths("button.tsx")).toEqual([
      "src/components/Button.tsx",
      // Scattered: b-u-t-t-o-n, then . t s x further on.
      "src/components/ButtonGroup.tsx",
    ])
    expect(paths("button")).toEqual([
      "test/button.test.ts",
      "src/components/Button.tsx",
      "src/components/ButtonGroup.tsx",
    ])
  })

  it("matches the folders of a path, and a scattered one last", () => {
    expect(paths("chat/comp")).toEqual(["src/features/chat/Composer.tsx"])
    expect(paths("scbtn")).toEqual(["src/components/Button.tsx", "src/components/ButtonGroup.tsx"])
  })

  it("is case-insensitive and reads Windows separators and `./`", () => {
    expect(paths("SRC\\INDEX")).toEqual(["src/index.ts"])
    expect(paths("./src/index.ts")).toEqual(["src/index.ts"])
  })

  it("takes a trailing slash as a folder and what is inside it", () => {
    expect(paths("src/components/")).toEqual([
      "src/components/",
      "src/components/Button.tsx",
      "src/components/ButtonGroup.tsx",
    ])
  })

  it("returns nothing when nothing matches, and at most `limit` entries", () => {
    expect(paths("zzz")).toEqual([])
    expect(paths("s", 2)).toHaveLength(2)
  })
})
