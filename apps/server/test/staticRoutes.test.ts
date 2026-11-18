import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { staticRoutes } from "../src/http/HttpApp.ts"
import { tempDir } from "./helpers.ts"

const fakeBuild = Effect.gen(function* () {
  const dist = yield* tempDir()
  mkdirSync(join(dist, "assets"))
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Humanity</title>")
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)")
  return dist
})

const serve = (dist: string) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        staticRoutes(dist).pipe(Layer.provide(NodeHttpServer.layerHttpServices), Layer.orDie),
        { disableLogger: true },
      ),
    ),
    ({ dispose }) => Effect.promise(dispose),
  ).pipe(
    Effect.map(
      ({ handler }) =>
        (path: string) =>
          Effect.promise(() =>
            handler(new Request(`http://127.0.0.1${path}`, { headers: { accept: "text/html" } })),
          ),
    ),
  )

describe("staticRoutes", () => {
  it.live("keeps hashed assets for good and checks the page on every load", () =>
    Effect.gen(function* () {
      const get = yield* serve(yield* fakeBuild)

      const asset = yield* get("/assets/index-abc123.js")
      assert.strictEqual(asset.status, 200)
      assert.strictEqual(asset.headers.get("cache-control"), "public, max-age=31536000, immutable")
      assert.strictEqual(yield* Effect.promise(() => asset.text()), "console.log(1)")

      for (const path of ["/", "/projects/p1/sessions/s1"]) {
        const page = yield* get(path)
        assert.strictEqual(page.status, 200, path)
        assert.strictEqual(page.headers.get("cache-control"), "no-cache", path)
        assert.include(yield* Effect.promise(() => page.text()), "<title>Humanity</title>")
      }

      assert.strictEqual((yield* get("/assets/index-old999.js")).status, 404)
    }).pipe(Effect.scoped),
  )
})
