import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { packageName } from "@humanity/diff"

it.effect("resolves workspace packages from source", () =>
  Effect.gen(function* () {
    assert.strictEqual(packageName, "@humanity/diff")
  }),
)
