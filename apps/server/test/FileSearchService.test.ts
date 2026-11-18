import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Fiber, Layer, Ref } from "effect"
import { TestClock } from "effect/testing"
import { FileSearchService } from "../src/services/FileSearchService.ts"
import { GitService } from "../src/services/GitService.ts"

const setup = (first: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const files = yield* Ref.make(first)
    const listings = yield* Ref.make(0)
    const gate = yield* Ref.make<Deferred.Deferred<void> | undefined>(undefined)
    const listFiles = () =>
      Effect.gen(function* () {
        yield* Ref.update(listings, (count) => count + 1)
        const wait = yield* Ref.get(gate)
        if (wait !== undefined) yield* Deferred.await(wait)
        return yield* Ref.get(files)
      })
    const layer = FileSearchService.layer.pipe(
      Layer.provide(Layer.succeed(GitService, { listFiles } as unknown as GitService["Service"])),
    )
    const service = Context.get(yield* Layer.build(layer), FileSearchService)
    const paths = (query: string) =>
      Effect.map(service.search("/repo", query), (entries) => entries.map((entry) => entry.path))
    return { files, listings, gate, paths }
  })

describe("FileSearchService", () => {
  it.effect("lists the files once and answers every query from that index", () =>
    Effect.gen(function* () {
      const { listings, paths } = yield* setup(["a.ts", "b.ts"])
      assert.deepStrictEqual(yield* paths("a"), ["a.ts"])
      assert.deepStrictEqual(yield* paths("b"), ["b.ts"])
      assert.strictEqual(yield* Ref.get(listings), 1)
    }),
  )

  it.effect("answers from the old index while a stale one is listed again", () =>
    Effect.gen(function* () {
      const { files, listings, gate, paths } = yield* setup(["old.ts"])
      yield* paths("")
      yield* Ref.set(files, ["old.ts", "new.ts"])
      const wait = yield* Deferred.make<void>()
      yield* Ref.set(gate, wait)
      yield* TestClock.adjust("6 seconds")

      assert.deepStrictEqual(yield* paths("new"), [])
      assert.deepStrictEqual(yield* paths("new"), [])
      yield* Deferred.succeed(wait, undefined)
      yield* Effect.yieldNow
      assert.strictEqual(yield* Ref.get(listings), 2)
      assert.deepStrictEqual(yield* paths("new"), ["new.ts"])
    }),
  )

  it.effect("shares one listing between searches that arrive while it runs", () =>
    Effect.gen(function* () {
      const { listings, gate, paths } = yield* setup(["a.ts"])
      const wait = yield* Deferred.make<void>()
      yield* Ref.set(gate, wait)
      const first = yield* Effect.forkChild(paths("a"))
      const second = yield* Effect.forkChild(paths("a"))
      yield* Effect.yieldNow
      yield* Deferred.succeed(wait, undefined)
      assert.deepStrictEqual(yield* Fiber.join(first), ["a.ts"])
      assert.deepStrictEqual(yield* Fiber.join(second), ["a.ts"])
      assert.strictEqual(yield* Ref.get(listings), 1)
    }),
  )
})
