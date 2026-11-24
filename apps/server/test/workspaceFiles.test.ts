import { assert, describe, it } from "@effect/vitest"
import { FILE_OPEN_LIMIT_BYTES } from "@humanity/contracts"
import { Effect } from "effect"
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { humanEditsNote } from "../src/files/humanEdits.ts"
import {
  decodeText,
  readWorkspaceFile,
  versionOf,
  workspaceVersions,
  writeWorkspaceFile,
} from "../src/files/workspaceFiles.ts"
import { tempDir } from "./helpers.ts"

const folder = (files: Record<string, string | Uint8Array>) =>
  Effect.gen(function* () {
    const root = yield* tempDir("humanity-files-")
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    return root
  })

const save = (
  root: string,
  path: string,
  content: string,
  baseVersion: string | null,
  overwrite = false,
) => writeWorkspaceFile(root, { path, content, bom: false, baseVersion, overwrite })

const textOf = (root: string, path: string) =>
  Effect.flatMap(readWorkspaceFile(root, path), (file) =>
    file._tag === "Text" ? Effect.succeed(file) : Effect.die(`${path} is ${file._tag}`),
  )

describe("readWorkspaceFile", () => {
  it.effect("reads a text file with its version", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "src/a.ts": "export const a = 1\n" })
      const file = yield* textOf(root, "src/a.ts")
      assert.strictEqual(file.content, "export const a = 1\n")
      assert.strictEqual(file.bom, false)
      assert.strictEqual(file.version, versionOf(readFileSync(join(root, "src/a.ts"))))
    }),
  )

  it.effect("keeps a byte order mark apart from the text", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "\uFEFFhello" })
      const file = yield* textOf(root, "a.txt")
      assert.strictEqual(file.content, "hello")
      assert.strictEqual(file.bom, true)
    }),
  )

  it.effect("keeps CRLF line endings as they are", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "one\r\ntwo\r\n" })
      assert.strictEqual((yield* textOf(root, "a.txt")).content, "one\r\ntwo\r\n")
    }),
  )

  it.effect("tells binary and too large files apart from text", () =>
    Effect.gen(function* () {
      const root = yield* folder({
        "image.png": new Uint8Array([137, 80, 78, 71, 0, 1]),
        "latin1.txt": new Uint8Array([0x63, 0x61, 0x66, 0xe9]),
        "big.txt": "x".repeat(FILE_OPEN_LIMIT_BYTES + 1),
      })
      assert.strictEqual((yield* readWorkspaceFile(root, "image.png"))._tag, "Binary")
      assert.strictEqual((yield* readWorkspaceFile(root, "latin1.txt"))._tag, "Binary")
      assert.strictEqual((yield* readWorkspaceFile(root, "big.txt"))._tag, "TooLarge")
    }),
  )

  it.effect("refuses paths that leave the folder or reach into .git", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "a", ".git/config": "[core]" })
      for (const path of [
        "../a.txt",
        "/etc/passwd",
        "C:/Windows/win.ini",
        "a/../../b",
        ".git/config",
        "src\\a.ts",
        "",
      ]) {
        const error = yield* Effect.flip(readWorkspaceFile(root, path))
        assert.strictEqual(error._tag, "FileRefused", path)
      }
    }),
  )

  it.effect("refuses a link that leads outside the folder", () =>
    Effect.gen(function* () {
      const outside = yield* folder({ "secret.txt": "secret" })
      const root = yield* folder({})
      const linked = yield* Effect.try(() =>
        symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"), "file"),
      ).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      )
      if (!linked) return
      const error = yield* Effect.flip(readWorkspaceFile(root, "link.txt"))
      assert.strictEqual(error._tag, "FileRefused")
      const write = yield* Effect.flip(save(root, "link.txt", "changed", null, true))
      assert.strictEqual(write._tag, "FileRefused")
      assert.strictEqual(readFileSync(join(outside, "secret.txt"), "utf8"), "secret")
    }),
  )

  it.effect("says a missing file is missing", () =>
    Effect.gen(function* () {
      const root = yield* folder({})
      assert.strictEqual(
        (yield* Effect.flip(readWorkspaceFile(root, "gone.ts")))._tag,
        "FileNotFound",
      )
    }),
  )
})

describe("writeWorkspaceFile", () => {
  it.effect("saves over the version that was opened", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.ts": "old\n" })
      const opened = yield* textOf(root, "a.ts")
      const saved = yield* save(root, "a.ts", "new\n", opened.version)
      assert.strictEqual(readFileSync(join(root, "a.ts"), "utf8"), "new\n")
      assert.strictEqual(saved.version, (yield* textOf(root, "a.ts")).version)
    }),
  )

  it.effect("refuses to save over a file that changed since it was opened", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.ts": "old\n" })
      const opened = yield* textOf(root, "a.ts")
      writeFileSync(join(root, "a.ts"), "the agent's\n")
      const error = yield* Effect.flip(save(root, "a.ts", "mine\n", opened.version))
      assert.strictEqual(error._tag, "FileChangedOnDisk")
      if (error._tag === "FileChangedOnDisk") {
        assert.strictEqual(error.version, versionOf(readFileSync(join(root, "a.ts"))))
      }
      assert.strictEqual(readFileSync(join(root, "a.ts"), "utf8"), "the agent's\n")
    }),
  )

  it.effect("overwrites the disk when the human keeps their version", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.ts": "old\n" })
      const opened = yield* textOf(root, "a.ts")
      writeFileSync(join(root, "a.ts"), "the agent's\n")
      yield* save(root, "a.ts", "mine\n", opened.version, true)
      assert.strictEqual(readFileSync(join(root, "a.ts"), "utf8"), "mine\n")
    }),
  )

  it.effect("says a deleted file was deleted, and writes it again only when kept", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "src/a.ts": "old\n" })
      const opened = yield* textOf(root, "src/a.ts")
      rmSync(join(root, "src/a.ts"))
      const error = yield* Effect.flip(save(root, "src/a.ts", "mine\n", opened.version))
      assert.strictEqual(error._tag, "FileChangedOnDisk")
      if (error._tag === "FileChangedOnDisk") assert.strictEqual(error.version, null)
      yield* save(root, "src/a.ts", "mine\n", opened.version, true)
      assert.strictEqual(readFileSync(join(root, "src/a.ts"), "utf8"), "mine\n")
    }),
  )

  it.effect("writes the byte order mark back", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "\uFEFFold" })
      const opened = yield* textOf(root, "a.txt")
      yield* writeWorkspaceFile(root, {
        path: "a.txt",
        content: "new",
        bom: true,
        baseVersion: opened.version,
        overwrite: false,
      })
      assert.strictEqual(readFileSync(join(root, "a.txt"), "utf8"), "\uFEFFnew")
    }),
  )

  it.effect("never writes outside the folder", () =>
    Effect.gen(function* () {
      const root = yield* folder({})
      const error = yield* Effect.flip(save(root, "../escape.txt", "x", null, true))
      assert.strictEqual(error._tag, "FileRefused")
    }),
  )

  it.effect("never writes through a link to a file that does not exist yet", () =>
    Effect.gen(function* () {
      const outside = yield* folder({})
      const root = yield* folder({})
      symlinkSync(join(outside, "missing"), join(root, "gone"), "junction")
      const error = yield* Effect.flip(save(root, "gone", "x", null, true))
      assert.strictEqual(error._tag, "FileRefused")
      const linked = yield* Effect.try(() =>
        symlinkSync(join(outside, "planted.txt"), join(root, "notes.md"), "file"),
      ).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      )
      if (!linked) return
      const write = yield* Effect.flip(save(root, "notes.md", "x", null, true))
      assert.strictEqual(write._tag, "FileRefused")
      assert.isFalse(existsSync(join(outside, "planted.txt")))
    }),
  )
})

describe("workspaceVersions", () => {
  it.effect("gives each file's version, and null for a missing one", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.ts": "a" })
      const versions = yield* workspaceVersions(root, ["a.ts", "gone.ts", "a.ts"])
      assert.deepStrictEqual(versions, [
        { path: "a.ts", version: versionOf(new TextEncoder().encode("a")) },
        { path: "gone.ts", version: null },
      ])
    }),
  )
})

describe("decodeText", () => {
  it("treats a NUL byte as binary", () => {
    assert.strictEqual(decodeText(new Uint8Array([104, 0, 105])), undefined)
  })
})

describe("humanEditsNote", () => {
  it("says nothing when the human edited nothing", () => {
    assert.strictEqual(humanEditsNote([]), undefined)
  })

  it("names the files the human edited", () => {
    assert.strictEqual(
      humanEditsNote(["src/a.ts"]),
      "[Humanity] The human edited this file in Humanity's editor: src/a.ts. What you read from it before is out of date: read it again before you rely on it or edit it.",
    )
    assert.include(humanEditsNote(["a", "b"]), "these files in Humanity's editor: a, b.")
  })

  it("lists twenty files and counts the rest", () => {
    const paths = Array.from({ length: 23 }, (_, index) => `f${index}`)
    assert.include(humanEditsNote(paths), "f19 and 3 more.")
  })
})
