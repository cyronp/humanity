import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { GitService } from "../src/services/GitService.ts"
import { git, tempDir, tempRepo } from "./helpers.ts"

const GitLive = GitService.layer.pipe(Layer.provide(NodeServices.layer))

const withGit = <A, E>(body: (git: GitService["Service"]) => Effect.Effect<A, E, never>) =>
  GitService.use(body).pipe(Effect.provide(GitLive))

describe("GitService", () => {
  it.live("reports a directory that is not a repository with a tagged error", () =>
    Effect.gen(function* () {
      const dir = yield* tempDir()
      const error = yield* withGit((service) => Effect.flip(service.repositoryRoot(dir)))
      assert.strictEqual(error._tag, "GitNotARepository")
    }),
  )

  it.live("lists branches and marks the current one", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      git(repo, "branch", "feature/one")

      const branches = yield* withGit((service) => service.listBranches(repo))
      assert.deepStrictEqual(
        branches.map((branch) => [branch.name, branch.isCurrent, branch.isRemote]),
        [
          ["feature/one", false, false],
          ["main", true, false],
        ],
      )
      assert.strictEqual(branches[1]?.subject, "initial")
      assert.isAbove(branches[1]?.author.length ?? 0, 0)
      assert.isFalse(Number.isNaN(Date.parse(branches[1]?.committedAt ?? "")))
      assert.match(branches[1]?.commit ?? "", /^[0-9a-f]{7,}$/)
    }),
  )

  it.live("creates a branch without checking it out", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()

      const branch = yield* withGit((service) => service.createBranch(repo, "topic", "main"))
      assert.strictEqual(branch.name, "topic")
      assert.isFalse(branch.isCurrent)
      assert.strictEqual(yield* withGit((service) => service.currentBranch(repo)), "main")
    }),
  )

  it.live("rejects duplicate, invalid and unknown refs with tagged errors", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()

      yield* withGit((service) =>
        Effect.gen(function* () {
          const duplicate = yield* Effect.flip(service.createBranch(repo, "main", "main"))
          assert.strictEqual(duplicate._tag, "GitBranchExists")

          for (const name of ["", "has space", "--force", "-b", "a..b", "trailing.lock"]) {
            const invalid = yield* Effect.flip(service.createBranch(repo, name, "main"))
            assert.strictEqual(invalid._tag, "GitInvalidBranchName", `name: ${name}`)
          }

          const unknown = yield* Effect.flip(service.createBranch(repo, "ok", "no-such-branch"))
          assert.strictEqual(unknown._tag, "GitRefNotFound")

          const optionLike = yield* Effect.flip(service.createBranch(repo, "ok", "--all"))
          assert.strictEqual(optionLike._tag, "GitRefNotFound")
        }),
      )
      // None of the rejected calls left a branch behind.
      assert.strictEqual(git(repo, "branch", "--list").trim(), "* main")
    }),
  )

  it.live("passes arguments to git verbatim, never through a shell", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      const marker = join(repo, "pwned")
      // Legal in a ref name (and a file name), and a command chain if a shell ever saw it.
      const name = `x;touch${"$"}{IFS}pwned&&touch${"$"}{IFS}pwned`

      const branch = yield* withGit((service) => service.createBranch(repo, name, "main"))

      assert.strictEqual(branch.name, name)
      assert.isFalse(existsSync(marker))
    }),
  )

  it.live("reports a clean status with the current branch", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      const status = yield* withGit((service) => service.status(repo))
      assert.deepStrictEqual(status, {
        branch: "main",
        upstream: null,
        ahead: 0,
        behind: 0,
        entries: [],
      })
    }),
  )

  it.live("parses modified, staged, untracked, deleted and renamed entries", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo({
        "modified.txt": "one\n",
        "staged.txt": "one\n",
        "deleted.txt": "bye\n",
        "old name.txt": "a file that will be renamed, long enough to be detected\n",
      })
      writeFileSync(join(repo, "modified.txt"), "two\n")
      writeFileSync(join(repo, "staged.txt"), "two\n")
      git(repo, "add", "staged.txt")
      rmSync(join(repo, "deleted.txt"))
      renameSync(join(repo, "old name.txt"), join(repo, "new name.txt"))
      git(repo, "add", "--all", "old name.txt", "new name.txt")
      writeFileSync(join(repo, "untracked file.txt"), "new\n")

      const status = yield* withGit((service) => service.status(repo))
      const byPath = new Map(status.entries.map((entry) => [entry.path, entry]))

      assert.deepInclude(byPath.get("modified.txt"), {
        kind: "modified",
        staged: false,
        unstaged: true,
      })
      assert.deepInclude(byPath.get("staged.txt"), {
        kind: "modified",
        staged: true,
        unstaged: false,
      })
      assert.deepInclude(byPath.get("deleted.txt"), { kind: "deleted", unstaged: true })
      assert.deepInclude(byPath.get("new name.txt"), {
        kind: "renamed",
        previousPath: "old name.txt",
        staged: true,
      })
      assert.deepInclude(byPath.get("untracked file.txt"), { kind: "untracked", staged: false })
      assert.strictEqual(status.entries.length, 5)
    }),
  )

  it.live("diffs the working tree, including untracked files, as hunks", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo({ "app.ts": "const a = 1\nconst b = 2\nconst c = 3\n" })
      writeFileSync(join(repo, "app.ts"), "const a = 1\nconst b = 20\nconst c = 3\n")
      writeFileSync(join(repo, "fresh.ts"), "export const fresh = true\n")

      const diff = yield* withGit((service) => service.diff(repo))
      assert.strictEqual(diff.base, "HEAD")
      assert.deepStrictEqual(
        diff.files.map((file) => [file.filePath, file.kind]),
        [
          ["app.ts", "modify"],
          ["fresh.ts", "create"],
        ],
      )
      assert.deepStrictEqual(diff.files[0]?.hunks[0]?.lines, [
        " const a = 1",
        "-const b = 2",
        "+const b = 20",
        " const c = 3",
      ])
      assert.deepStrictEqual(diff.files[1]?.hunks[0]?.lines, ["+export const fresh = true"])
    }),
  )

  it.live("returns an empty diff for a clean tree", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      const diff = yield* withGit((service) => service.diff(repo))
      assert.deepStrictEqual(diff.files, [])
    }),
  )

  it.live("adds a worktree on a new branch and leaves the original copy untouched", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo({ "README.md": "# fixture\n" })
      const home = yield* tempDir()
      const worktree = join(home, "worktrees", "p1", "s1")

      yield* withGit((service) =>
        Effect.gen(function* () {
          yield* service.worktreeAdd(repo, {
            path: worktree,
            branch: "humanity/abc123-fix-bug",
            base: "main",
          })

          assert.strictEqual(readFileSync(join(worktree, "README.md"), "utf8"), "# fixture\n")
          assert.strictEqual(yield* service.currentBranch(worktree), "humanity/abc123-fix-bug")

          // The user's working copy is still on main and still clean.
          assert.strictEqual(yield* service.currentBranch(repo), "main")
          assert.deepStrictEqual((yield* service.status(repo)).entries, [])

          const listed = yield* service.worktreeList(repo)
          assert.strictEqual(listed.length, 2)
          assert.strictEqual(listed[1]?.branch, "humanity/abc123-fix-bug")

          // Work in the worktree does not leak into the original copy.
          writeFileSync(join(worktree, "README.md"), "# changed by the agent\n")
          assert.strictEqual((yield* service.status(worktree)).entries.length, 1)
          assert.deepStrictEqual((yield* service.status(repo)).entries, [])
          assert.strictEqual(readFileSync(join(repo, "README.md"), "utf8"), "# fixture\n")

          const hash = yield* service.commit(worktree, "agent: update readme")
          assert.match(hash, /^[0-9a-f]{7,}$/)
          assert.deepStrictEqual((yield* service.status(worktree)).entries, [])
          assert.strictEqual(git(repo, "log", "-1", "--format=%s", "main").trim(), "initial")

          yield* service.worktreeRemove(repo, worktree)
          assert.isFalse(existsSync(worktree))
          assert.strictEqual((yield* service.worktreeList(repo)).length, 1)
          // The branch and its commit survive the worktree.
          assert.strictEqual(
            git(repo, "log", "-1", "--format=%s", "humanity/abc123-fix-bug").trim(),
            "agent: update readme",
          )
        }),
      )
    }),
  )

  it.live("refuses to add a worktree for an existing branch or a missing base", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      const home = yield* tempDir()

      yield* withGit((service) =>
        Effect.gen(function* () {
          const exists = yield* Effect.flip(
            service.worktreeAdd(repo, { path: join(home, "a"), branch: "main", base: "main" }),
          )
          assert.strictEqual(exists._tag, "GitBranchExists")

          const missing = yield* Effect.flip(
            service.worktreeAdd(repo, { path: join(home, "b"), branch: "ok", base: "nope" }),
          )
          assert.strictEqual(missing._tag, "GitRefNotFound")
        }),
      )
      assert.isFalse(existsSync(join(home, "a")))
      assert.isFalse(existsSync(join(home, "b")))
    }),
  )

  it.live("checks out a branch inside a worktree", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      const home = yield* tempDir()
      const worktree = join(home, "wt")
      git(repo, "branch", "other")

      yield* withGit((service) =>
        Effect.gen(function* () {
          yield* service.worktreeAdd(repo, { path: worktree, branch: "session", base: "main" })
          yield* service.checkout(worktree, "other")
          assert.strictEqual(yield* service.currentBranch(worktree), "other")
          assert.strictEqual(yield* service.currentBranch(repo), "main")

          const invalid = yield* Effect.flip(service.checkout(worktree, "--detach"))
          assert.strictEqual(invalid._tag, "GitInvalidBranchName")
          yield* service.worktreeRemove(repo, worktree)
        }),
      )
    }),
  )

  it.live("derives the default branch and the GitHub remote", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      git(repo, "remote", "add", "origin", "https://github.com/acme/widgets.git")

      yield* withGit((service) =>
        Effect.gen(function* () {
          assert.strictEqual(yield* service.defaultBranch(repo), "main")
          assert.strictEqual(yield* service.originUrl(repo), "https://github.com/acme/widgets.git")
        }),
      )
    }),
  )
})
