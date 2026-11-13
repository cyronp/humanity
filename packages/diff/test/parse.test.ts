import { describe, expect, it } from "vitest"
import {
  countChanges,
  currentLineNumbers,
  hunkReference,
  lineReference,
  parseUnifiedDiff,
  toDiffLines,
} from "../src/index.ts"

const GIT_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { a } from "./a"
-const x = 1
+const x = 2
+const y = 3
 export {}
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const created = true
+export const second = 2
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const gone = true
`

describe("parseUnifiedDiff", () => {
  it("returns nothing for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([])
    expect(parseUnifiedDiff("\n")).toEqual([])
  })

  it("parses modified, created and deleted files from git diff output", () => {
    const files = parseUnifiedDiff(GIT_DIFF)
    expect(files.map((file) => [file.filePath, file.kind])).toEqual([
      ["src/app.ts", "modify"],
      ["src/new.ts", "create"],
      ["src/old.ts", "delete"],
    ])
    expect(files[0]?.hunks[0]).toMatchObject({
      index: 1,
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
    })
    expect(files[0]?.hunks[0]?.lines).toEqual([
      ' import { a } from "./a"',
      "-const x = 1",
      "+const x = 2",
      "+const y = 3",
      " export {}",
    ])
    expect(files.every((file) => !file.binary)).toBe(true)
  })

  it("numbers several hunks of one file from 1", () => {
    const diff = `diff --git a/f.txt b/f.txt
--- a/f.txt
+++ b/f.txt
@@ -1,2 +1,2 @@
-a
+A
 b
@@ -10,2 +10,2 @@
 j
-k
+K
`
    const [file] = parseUnifiedDiff(diff)
    expect(file?.hunks.map((hunk) => hunk.index)).toEqual([1, 2])
  })

  it("reports renames with the previous path", () => {
    const diff = `diff --git a/old/name.ts b/new/name.ts
similarity index 90%
rename from old/name.ts
rename to new/name.ts
index 1111111..2222222 100644
--- a/old/name.ts
+++ b/new/name.ts
@@ -1 +1 @@
-a
+b
`
    const [file] = parseUnifiedDiff(diff)
    expect(file).toMatchObject({
      filePath: "new/name.ts",
      previousPath: "old/name.ts",
      kind: "rename",
    })
  })
})

describe("toDiffLines", () => {
  it("assigns old and new line numbers", () => {
    const [file] = parseUnifiedDiff(GIT_DIFF)
    const hunk = file?.hunks[0]
    expect(hunk && toDiffLines(hunk)).toEqual([
      { kind: "context", text: 'import { a } from "./a"', oldNumber: 1, newNumber: 1 },
      { kind: "remove", text: "const x = 1", oldNumber: 2 },
      { kind: "add", text: "const x = 2", newNumber: 2 },
      { kind: "add", text: "const y = 3", newNumber: 3 },
      { kind: "context", text: "export {}", oldNumber: 3, newNumber: 4 },
    ])
  })

  it("turns the no-newline marker into a meta row and strips carriage returns", () => {
    const rows = toDiffLines({
      index: 1,
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: ["-a\r", "\\ No newline at end of file", "+b\r"],
    })
    expect(rows).toEqual([
      { kind: "remove", text: "a", oldNumber: 1 },
      { kind: "meta", text: "No newline at end of file" },
      { kind: "add", text: "b", newNumber: 1 },
    ])
  })
})

describe("countChanges", () => {
  it("counts added and removed lines across hunks", () => {
    const files = parseUnifiedDiff(GIT_DIFF)
    expect(countChanges(files[0]?.hunks ?? [])).toEqual({ added: 2, removed: 1 })
    expect(countChanges(files.flatMap((file) => file.hunks))).toEqual({ added: 4, removed: 2 })
  })
})

describe("references for a message", () => {
  const files = parseUnifiedDiff(GIT_DIFF)

  it("names a row by its line in the file as it is now", () => {
    const hunk = files[0]?.hunks[0]
    const rows = hunk === undefined ? [] : toDiffLines(hunk)
    expect(rows.map((row) => lineReference("src/app.ts", row))).toEqual([
      "src/app.ts:1",
      "src/app.ts:2 (removed line)",
      "src/app.ts:2",
      "src/app.ts:3",
      "src/app.ts:4",
    ])
    expect(lineReference("src/app.ts", { kind: "meta", text: "No newline at end of file" })).toBe(
      undefined,
    )
  })

  it("names a hunk by the lines it covers", () => {
    const [modified, created, deleted] = files.map((file) => file.hunks[0])
    expect(modified && hunkReference("src/app.ts", modified)).toBe("src/app.ts:1-4")
    expect(created && hunkReference("src/new.ts", created)).toBe("src/new.ts:1-2")
    expect(deleted && hunkReference("src/old.ts", deleted)).toBe("src/old.ts:1 (removed lines)")
    expect(
      hunkReference("a.ts", {
        index: 1,
        oldStart: 7,
        oldLines: 0,
        newStart: 8,
        newLines: 1,
        lines: ["+x"],
      }),
    ).toBe("a.ts:8")
  })
})

describe("currentLineNumbers", () => {
  const row = (kind: "context" | "add" | "remove", number: number) =>
    kind === "remove"
      ? { kind, text: "", oldNumber: number }
      : kind === "add"
        ? { kind, text: "", newNumber: number }
        : { kind, text: "", oldNumber: number, newNumber: number }

  it("keeps the current number and sends a removed line to the one that took its place", () => {
    const [file] = parseUnifiedDiff(GIT_DIFF)
    const hunk = file?.hunks[0]
    expect(hunk && currentLineNumbers(toDiffLines(hunk))).toEqual([1, 2, 2, 3, 4])
  })

  it("sends removed lines at the end of a hunk past the last kept line", () => {
    expect(currentLineNumbers([row("context", 5), row("remove", 6), row("remove", 7)])).toEqual([
      5, 6, 6,
    ])
  })

  it("has no place for meta rows or a hunk that keeps nothing", () => {
    expect(
      currentLineNumbers([row("remove", 1), { kind: "meta", text: "No newline at end of file" }]),
    ).toEqual([undefined, undefined])
  })
})
