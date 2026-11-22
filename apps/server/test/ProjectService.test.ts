import { assert, describe, it } from "@effect/vitest"
import { DEFAULT_PROJECT_SETTINGS } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, sep } from "node:path"
import { GitService } from "../src/services/GitService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { baseLayer, git, tempDir, tempRepo } from "./helpers.ts"

const services = (home: string) =>
  ProjectService.layer.pipe(Layer.provideMerge(GitService.layer), Layer.provide(baseLayer(home)))

describe("ProjectService", () => {
  it.live("adds a local repository with the default policy", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      const project = yield* Effect.gen(function* () {
        const projects = yield* ProjectService
        return yield* projects.addLocal(repo)
      }).pipe(Effect.provide(services(home)))

      assert.strictEqual(project.defaultBranch, "main")
      assert.strictEqual(project.githubFullName, null)
      assert.isNull(project.defaultAutonomy)
      assert.isTrue(existsSync(join(home, "humanity.db")))
    }),
  )

  it.live("keeps projects across daemon restarts", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      const added = yield* ProjectService.use((projects) => projects.addLocal(repo)).pipe(
        Effect.provide(services(home)),
      )
      const listed = yield* ProjectService.use((projects) => projects.list).pipe(
        Effect.provide(services(home)),
      )

      assert.deepStrictEqual(listed, [added])
    }),
  )

  it.live("resolves a subdirectory to the repository root and reads the GitHub remote", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo({ "src/index.ts": "export {}\n" })
      git(repo, "remote", "add", "origin", "git@github.com:acme/widgets.git")

      const project = yield* ProjectService.use((projects) =>
        projects.addLocal(join(repo, "src")),
      ).pipe(Effect.provide(services(home)))

      assert.strictEqual(project.localPath.toLowerCase(), repo.toLowerCase())
      assert.strictEqual(project.githubFullName, "acme/widgets")
    }),
  )

  it.live("reads a GitLab remote, subgroups included", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()
      git(repo, "remote", "add", "origin", "git@gitlab.com:acme/tools/widgets.git")

      const project = yield* ProjectService.use((projects) => projects.addLocal(repo)).pipe(
        Effect.provide(services(home)),
      )

      assert.strictEqual(project.githubFullName, null)
      assert.deepStrictEqual(project.gitlab, { host: "gitlab.com", fullPath: "acme/tools/widgets" })
      const listed = yield* ProjectService.use((projects) => projects.list).pipe(
        Effect.provide(services(home)),
      )
      assert.deepStrictEqual(listed[0]?.gitlab, project.gitlab)
    }),
  )

  it.live("rejects missing paths, non-repositories and duplicates with tagged errors", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()
      const plainDir = yield* tempDir("humanity-plain-")

      yield* Effect.gen(function* () {
        const projects = yield* ProjectService

        const missing = yield* Effect.flip(projects.addLocal(join(plainDir, "nope")))
        assert.strictEqual(missing._tag, "PathNotFound")

        const notRepo = yield* Effect.flip(projects.addLocal(plainDir))
        assert.strictEqual(notRepo._tag, "GitNotARepository")

        yield* projects.addLocal(repo)
        const duplicate = yield* Effect.flip(projects.addLocal(repo))
        assert.strictEqual(duplicate._tag, "ProjectAlreadyExists")
      }).pipe(Effect.provide(services(home)))
    }),
  )

  it.live("lists the folders that complete a typed path, repositories marked", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const root = yield* tempDir("humanity-browse-")
      mkdirSync(join(root, "Apps"))
      mkdirSync(join(root, "app-two", ".git"), { recursive: true })
      mkdirSync(join(root, ".hidden-app"))
      mkdirSync(join(root, "other"))
      writeFileSync(join(root, "app.txt"), "not a folder\n")

      yield* Effect.gen(function* () {
        const projects = yield* ProjectService
        const folder = `${root}${sep}`

        assert.deepStrictEqual(yield* projects.listFolders(folder, "app"), [
          { name: "app-two", isRepository: true },
          { name: "Apps", isRepository: false },
        ])
        assert.deepStrictEqual(yield* projects.listFolders(folder, ".h"), [
          { name: ".hidden-app", isRepository: false },
        ])
        assert.strictEqual((yield* projects.listFolders(folder, "")).length, 3)
        assert.deepStrictEqual(yield* projects.listFolders(join(root, "nope") + sep, ""), [])
      }).pipe(Effect.provide(services(home)))
    }),
  )

  it.live("removes only Humanity's records, never the repository", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      yield* Effect.gen(function* () {
        const projects = yield* ProjectService
        const project = yield* projects.addLocal(repo)
        yield* projects.remove(project.id)

        assert.deepStrictEqual(yield* projects.list, [])
        assert.isTrue(existsSync(join(repo, "README.md")))

        const again = yield* Effect.flip(projects.remove(project.id))
        assert.strictEqual(again._tag, "ProjectNotFound")
      }).pipe(Effect.provide(services(home)))
    }),
  )

  it.live("renames a project and keeps its settings across daemon restarts", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()
      const settings = {
        ...DEFAULT_PROJECT_SETTINGS,
        defaultModel: { provider: "codex" as const, model: "gpt-5" },
        worktreeForNewThreads: true,
        setupScript: "npm install",
        branchPrefix: "me/",
        mergeMethod: "rebase" as const,
        draftPullRequests: true,
        worktreeOnEnd: "remove" as const,
      }

      const added = yield* Effect.gen(function* () {
        const projects = yield* ProjectService
        const project = yield* projects.addLocal(repo)
        assert.deepStrictEqual(project.settings, DEFAULT_PROJECT_SETTINGS)
        yield* projects.rename(project.id, "  Widgets  ")
        return yield* projects.setSettings(project.id, settings)
      }).pipe(Effect.provide(services(home)))
      const [listed] = yield* ProjectService.use((projects) => projects.list).pipe(
        Effect.provide(services(home)),
      )

      assert.strictEqual(listed?.name, "Widgets")
      assert.deepStrictEqual(listed?.settings, settings)
      assert.deepStrictEqual(listed, added)
    }),
  )

  it.live("reads settings it no longer understands as the defaults, field by field", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      const project = yield* Effect.gen(function* () {
        const projects = yield* ProjectService
        const sql = yield* SqlClient.SqlClient
        const added = yield* projects.addLocal(repo)
        yield* sql`UPDATE projects SET settings_json = ${'{"draftPullRequests":true}'}`
        const partial = yield* projects.get(added.id)
        yield* sql`UPDATE projects SET settings_json = ${"not json"}`
        return { partial, broken: yield* projects.get(added.id) }
      }).pipe(
        Effect.provide(
          ProjectService.layer.pipe(
            Layer.provideMerge(GitService.layer),
            Layer.provideMerge(baseLayer(home)),
          ),
        ),
      )

      assert.deepStrictEqual(project.partial.settings, {
        ...DEFAULT_PROJECT_SETTINGS,
        draftPullRequests: true,
      })
      assert.deepStrictEqual(project.broken.settings, DEFAULT_PROJECT_SETTINGS)
    }),
  )
})
