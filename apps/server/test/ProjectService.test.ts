import { assert, describe, it } from "@effect/vitest"
import { DEFAULT_TOOL_POLICY } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { existsSync } from "node:fs"
import { join } from "node:path"
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
      assert.deepStrictEqual(project.policy, DEFAULT_TOOL_POLICY)
      assert.isTrue(existsSync(join(home, "humanity.db")))
    }),
  )

  it.live("keeps projects across daemon restarts", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      // First "daemon": add the project, then tear every layer down.
      const added = yield* ProjectService.use((projects) => projects.addLocal(repo)).pipe(
        Effect.provide(services(home)),
      )
      // Second "daemon": fresh layers over the same data directory.
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
})
