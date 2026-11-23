import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { FakeAgentLog } from "../src/agent/AgentRunnerFake.ts"
import {
  createEntry,
  deleteEntries,
  fileSearchArgs,
  parseGrep,
  renameEntry,
} from "../src/files/fileOps.ts"
import { humanChangesNote } from "../src/files/humanEdits.ts"
import { FilesService } from "../src/services/FilesService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { git, tempDir } from "./helpers.ts"
import { addProject, services, setup, waitForStatus } from "./sessionHelpers.ts"

const folder = (files: Record<string, string>) =>
  Effect.gen(function* () {
    const root = yield* tempDir("humanity-ops-")
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    return root
  })

describe("file operations", () => {
  it.effect("creates a file with its folders, or a folder, and never over an entry", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "a" })
      yield* createEntry(root, "src/new/b.ts", "file")
      assert.strictEqual(readFileSync(join(root, "src/new/b.ts"), "utf8"), "")
      yield* createEntry(root, "docs", "folder")
      assert.isTrue(existsSync(join(root, "docs")))
      const taken = yield* Effect.flip(createEntry(root, "a.txt", "file"))
      assert.strictEqual(taken._tag, "FileRefused")
      for (const path of ["../out.txt", ".git/config", "/abs", "a\\b"]) {
        assert.strictEqual(
          (yield* Effect.flip(createEntry(root, path, "file")))._tag,
          "FileRefused",
        )
      }
    }),
  )

  it.effect("moves a file or a folder, never onto an entry or into itself", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "a", "dir/x.txt": "x", "b.txt": "b" })
      yield* renameEntry(root, "a.txt", "moved/a.txt")
      assert.strictEqual(readFileSync(join(root, "moved/a.txt"), "utf8"), "a")
      yield* renameEntry(root, "dir", "lib")
      assert.strictEqual(readFileSync(join(root, "lib/x.txt"), "utf8"), "x")
      assert.strictEqual(
        (yield* Effect.flip(renameEntry(root, "b.txt", "lib/x.txt")))._tag,
        "FileRefused",
      )
      assert.strictEqual(
        (yield* Effect.flip(renameEntry(root, "lib", "lib/inner")))._tag,
        "FileRefused",
      )
      assert.strictEqual(
        (yield* Effect.flip(renameEntry(root, "gone.txt", "c.txt")))._tag,
        "FileNotFound",
      )
    }),
  )

  it.effect("deletes every entry named, or none when one is refused", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "a", "dir/x.txt": "x" })
      const refused = yield* Effect.flip(deleteEntries(root, ["a.txt", "../elsewhere"]))
      assert.strictEqual(refused._tag, "FileRefused")
      assert.isTrue(existsSync(join(root, "a.txt")))
      yield* deleteEntries(root, ["a.txt", "dir"])
      assert.isFalse(existsSync(join(root, "a.txt")))
      assert.isFalse(existsSync(join(root, "dir")))
    }),
  )

  it.effect("does not follow a link that leads outside the folder", () =>
    Effect.gen(function* () {
      const root = yield* folder({ "a.txt": "a" })
      const outside = yield* folder({ "secret.txt": "s" })
      const linked = yield* Effect.try(() =>
        symlinkSync(outside, join(root, "out"), "junction"),
      ).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      )
      if (!linked) return
      assert.strictEqual(
        (yield* Effect.flip(createEntry(root, "out/new.txt", "file")))._tag,
        "FileRefused",
      )
      assert.strictEqual(
        (yield* Effect.flip(deleteEntries(root, ["out/secret.txt"])))._tag,
        "FileRefused",
      )
      assert.isTrue(existsSync(join(outside, "secret.txt")))
    }),
  )
})

describe("file search", () => {
  it("builds git grep's arguments from the search's options", () => {
    const args = fileSearchArgs({
      query: "foo",
      caseSensitive: false,
      wholeWord: true,
      regex: false,
      include: "*.ts, src/**",
      exclude: "*.test.ts",
    })
    assert.includeMembers([...args], ["-i", "-w", "-F", "--untracked", "--exclude-standard"])
    assert.deepStrictEqual(args.slice(args.indexOf("--") + 1), [
      ":(glob)**/*.ts",
      ":(glob)src/**",
      ":(exclude,glob)**/*.test.ts",
    ])
    const plain = fileSearchArgs({
      query: "a.b",
      caseSensitive: true,
      wholeWord: false,
      regex: true,
    })
    assert.notInclude([...plain], "-i")
    assert.include([...plain], "-E")
    assert.deepStrictEqual(plain.slice(plain.indexOf("--") + 1), [])
  })

  it("groups git grep's output by file", () => {
    const parsed = parseGrep(
      "a b/x:y.ts\u00002\u00005\u0000  foo: bar\r\nb.md\u00001\u00001\u0000Foo\n",
    )
    assert.deepStrictEqual(parsed, {
      files: [
        { path: "a b/x:y.ts", matches: [{ line: 2, column: 5, preview: "  foo: bar" }] },
        { path: "b.md", matches: [{ line: 1, column: 1, preview: "Foo" }] },
      ],
      matches: 2,
      truncated: false,
    })
  })

  it("describes the human's changes to the agent", () => {
    assert.strictEqual(
      humanChangesNote([
        { _tag: "created", path: "a.ts" },
        { _tag: "renamed", from: "b.ts", to: "c.ts" },
        { _tag: "deleted", path: "d" },
      ]),
      "[Humanity] The human changed the files of this folder in Humanity's editor: created a.ts; moved b.ts to c.ts; deleted d. Look at the folder again before you rely on what you saw of it.",
    )
    assert.isUndefined(humanChangesNote([]))
  })
})

describe("FilesService", () => {
  it.live("searches tracked and untracked files, and tells the agent what the human changed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({
        "src/app.ts": "const Foo = 1\n",
        ".gitignore": "out/\n",
      })
      writeFileSync(join(repo, "notes.md"), "foo bar\n")
      mkdirSync(join(repo, "out"))
      writeFileSync(join(repo, "out/build.js"), "foo\n")
      git(repo, "status")

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const files = yield* FilesService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")

        const found = yield* files.search(session.id, {
          query: "foo",
          caseSensitive: false,
          wholeWord: false,
          regex: false,
        })
        assert.sameMembers(
          found.files.map((file) => file.path),
          ["src/app.ts", "notes.md"],
        )
        const exact = yield* files.search(session.id, {
          query: "foo",
          caseSensitive: true,
          wholeWord: false,
          regex: false,
        })
        assert.deepStrictEqual(
          exact.files.map((file) => file.path),
          ["notes.md"],
        )
        const bad = yield* Effect.flip(
          files.search(session.id, {
            query: "(",
            caseSensitive: true,
            wholeWord: false,
            regex: true,
          }),
        )
        assert.strictEqual(bad._tag, "FileRefused")

        yield* files.create(session.id, "docs/new.md", "file")
        yield* files.rename(session.id, "notes.md", "docs/notes.md")
        yield* files.remove(session.id, ["docs/new.md"])
        yield* sessions.sendMessage(session.id, "go on")
        yield* waitForStatus(session.id, "idle")
        const sent = (yield* Ref.get(log.sent)).at(-1)?.text ?? ""
        assert.include(
          sent,
          "created docs/new.md; moved notes.md to docs/notes.md; deleted docs/new.md",
        )
      }).pipe(Effect.provide(services(home, () => [{ text: "ok" }])))
    }),
  )
})
