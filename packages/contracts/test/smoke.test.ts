import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { HunkStatus } from "../src/index.ts"

it.effect("decodes a hunk status", () =>
  Effect.gen(function* () {
    const status = yield* Schema.decodeUnknownEffect(HunkStatus)("approved")
    assert.strictEqual(status, "approved")
  }),
)
