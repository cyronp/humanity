import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { iconCandidates, iconMimeType } from "../src/services/projectIcon.ts"
import { GitService } from "../src/services/GitService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { baseLayer, tempDir, tempRepo } from "./helpers.ts"

const services = (home: string) =>
  ProjectService.layer.pipe(Layer.provideMerge(GitService.layer), Layer.provide(baseLayer(home)))

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

const iconOf = (repo: string) =>
  Effect.gen(function* () {
    const home = yield* tempDir()
    return yield* Effect.gen(function* () {
      const projects = yield* ProjectService
      const project = yield* projects.addLocal(repo)
      return yield* projects.icon(project.id)
    }).pipe(Effect.provide(services(home)))
  })

describe("iconCandidates", () => {
  it("tries the repository root before workspace packages, web-like names first", () => {
    const candidates = iconCandidates([{ root: "apps", names: ["server", "web"] }])
    assert.strictEqual(candidates[0], "favicon.svg")
    const web = candidates.indexOf("apps/web/public/favicon.svg")
    const server = candidates.indexOf("apps/server/public/favicon.svg")
    assert.isAbove(web, candidates.indexOf("public/favicon.ico"))
    assert.isBelow(web, server)
  })

  it("knows the image types it can send", () => {
    assert.strictEqual(iconMimeType("public/favicon.SVG"), "image/svg+xml")
    assert.strictEqual(iconMimeType("favicon.ico"), "image/x-icon")
    assert.strictEqual(iconMimeType("README.md"), undefined)
  })
})

describe("ProjectService.icon", () => {
  it.live("finds a favicon in public/", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo({ "public/favicon.svg": SVG })
      const icon = yield* iconOf(repo)
      assert.deepStrictEqual(icon, {
        mimeType: "image/svg+xml",
        base64: Buffer.from(SVG).toString("base64"),
      })
    }),
  )

  it.live("finds a favicon in a monorepo's web app", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo({
        "package.json": "{}",
        "apps/web/public/favicon.png": "png-bytes",
      })
      const icon = yield* iconOf(repo)
      assert.strictEqual(icon?.mimeType, "image/png")
    }),
  )

  it.live("returns null when there is no icon, and skips files that are too big", () =>
    Effect.gen(function* () {
      const repo = yield* tempRepo()
      assert.isNull(yield* iconOf(repo))

      writeFileSync(join(repo, "favicon.svg"), "x".repeat(300 * 1024))
      assert.isNull(yield* iconOf(repo))
    }),
  )
})
