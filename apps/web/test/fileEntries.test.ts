import { describe, expect, it } from "vitest"
import {
  entryPathProblem,
  filesUnder,
  isUnder,
  movedPath,
  normalizeEntryPath,
  parentOf,
} from "@/features/files/entries"
import { matchRange } from "@/features/files/fileSearchView"

describe("file entries", () => {
  it("knows what lies under an entry and where it goes when that moves", () => {
    expect(isUnder("src/a.ts", "src")).toBe(true)
    expect(isUnder("src", "src")).toBe(true)
    expect(isUnder("srcs/a.ts", "src")).toBe(false)
    expect(movedPath("src/a.ts", "src", "lib")).toBe("lib/a.ts")
    expect(movedPath("a.ts", "a.ts", "b/a.ts")).toBe("b/a.ts")
    expect(movedPath("other.ts", "src", "lib")).toBe("other.ts")
    expect(parentOf("src/deep/a.ts")).toBe("src/deep")
    expect(parentOf("a.ts")).toBe("")
    expect(filesUnder(["src/a.ts", "src/b/c.ts", "srcs/d.ts"], "src")).toBe(2)
  })

  it("cleans a typed path and names what is wrong with it", () => {
    expect(normalizeEntryPath(" ./src\\\\new//a.ts/ ")).toBe("src/new/a.ts")
    expect(entryPathProblem("")).toBe("Name the file.")
    expect(entryPathProblem("../x")).toBeDefined()
    expect(entryPathProblem(".git/hooks/x")).toBeDefined()
    expect(entryPathProblem("src/ok.ts")).toBeUndefined()
  })
})

describe("matchRange", () => {
  const match = { line: 3, column: 7, preview: "const Foo = foo()" }

  it("finds the match at git's column, else the first in the line", () => {
    expect(matchRange(match, "foo", { caseSensitive: false, regex: false })).toEqual({
      start: 6,
      length: 3,
    })
    expect(matchRange(match, "foo", { caseSensitive: true, regex: false })).toEqual({
      start: 12,
      length: 3,
    })
    expect(matchRange(match, "F.o", { caseSensitive: true, regex: true })).toEqual({
      start: 6,
      length: 3,
    })
    expect(matchRange(match, "(", { caseSensitive: true, regex: true })).toBeUndefined()
    expect(matchRange(match, "", { caseSensitive: true, regex: false })).toBeUndefined()
  })
})
