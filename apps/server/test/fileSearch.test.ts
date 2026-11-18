import { describe, expect, it } from "vitest"
import { indexFiles, parseFileList, searchFiles, searchIndex } from "../src/services/fileSearch.ts"

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

  it("prefers initials at word, folder and camelCase starts over scattered letters", () => {
    const files = [
      "docs/forge-api-rate-limits.md",
      "src/features/chat/FileMentionMenu.tsx",
      "src/features/chat/useFileMention.ts",
      "src/features/kiro/summary.ts",
    ]
    expect(searchFiles(files, "fmm", 1)[0]?.path).toBe("src/features/chat/FileMentionMenu.tsx")
    expect(searchFiles(files, "usefm", 1)[0]?.path).toBe("src/features/chat/useFileMention.ts")
  })

  it("treats -, _ and space as one separator, and as optional", () => {
    const files = ["src/session-service.ts", "src/SessionService.ts", "src/server.ts"]
    const found = (query: string) => searchFiles(files, query).map((entry) => entry.path)
    expect(found("session_service")).toEqual(["src/session-service.ts", "src/SessionService.ts"])
    expect(found("session service")).toEqual(["src/session-service.ts", "src/SessionService.ts"])
    expect(found("sesserv")[0]).toBe("src/SessionService.ts")
  })

  it("matches names written in decomposed Unicode", () => {
    const decomposed = "docs/Résumé.md"
    expect(searchFiles([decomposed], "résumé").map((entry) => entry.path)).toEqual([decomposed])
  })

  it("returns nothing when nothing matches, and at most `limit` entries", () => {
    expect(paths("zzz")).toEqual([])
    expect(paths("s", 2)).toHaveLength(2)
  })
})

describe("searchIndex", () => {
  it("keeps the same best results as ranking every match", () => {
    const files: Array<string> = []
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 9; b++) files.push(`pkg${a}/src/mod${b}/file${(a * 7 + b) % 13}.ts`)
    files.push("file1.ts", "README.md", "pkg3/file10.tsx")
    const index = indexFiles(files)
    for (const query of ["", "f", "file1", "mod3", "pkg1/", "p3f", "zzz"]) {
      const all = searchIndex(index, query, Number.MAX_SAFE_INTEGER)
      expect(searchIndex(index, query, 30)).toEqual(all.slice(0, 30))
      expect(searchFiles(files, query, 5)).toEqual(all.slice(0, 5))
    }
  })

  it("lists recent mentions first for an empty query, most recent first", () => {
    const recent = ["test/button.test.ts", "src/features/", "src/components/Button.tsx"]
    expect(
      searchIndex(indexFiles(FILES), "", 3, recent).map((entry) =>
        entry.kind === "directory" ? `${entry.path}/` : entry.path,
      ),
    ).toEqual(recent)
  })

  it("lifts a recent mention among similar matches, but not over an exact name", () => {
    const index = indexFiles(FILES)
    const recent = ["src/components/ButtonGroup.tsx"]
    expect(searchIndex(index, "button", 1, recent)[0]?.path).toBe("src/components/ButtonGroup.tsx")
    expect(searchIndex(index, "button.tsx", 1, recent)[0]?.path).toBe("src/components/Button.tsx")
  })

  it("ignores recent paths that are not in the index", () => {
    expect(searchIndex(indexFiles(FILES), "", 1, ["gone.ts"])[0]?.path).toBe("src")
  })

  it("returns nothing for a limit of zero", () => {
    expect(searchIndex(indexFiles(FILES), "", 0)).toEqual([])
  })
})
