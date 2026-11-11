import { assert, describe, it } from "@effect/vitest"
import { NO_PINS, type PinnedDefaults } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { PreferencesService } from "../src/services/PreferencesService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

const services = (home: string) =>
  PreferencesService.layer.pipe(Layer.provideMerge(baseLayer(home)))

describe("PreferencesService", () => {
  it.live("has nothing pinned until the human pins", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const pinned = yield* PreferencesService.use(
        (preferences) => preferences.pinnedDefaults,
      ).pipe(Effect.provide(services(home)))
      assert.deepStrictEqual(pinned, NO_PINS)
    }),
  )

  it.live("keeps the pins across daemon restarts", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const pins: PinnedDefaults = { autonomy: "ask", effort: "default" }

      yield* PreferencesService.use((preferences) => preferences.setPinnedDefaults(pins)).pipe(
        Effect.provide(services(home)),
      )
      const restored = yield* PreferencesService.use(
        (preferences) => preferences.pinnedDefaults,
      ).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(restored, pins)
    }),
  )

  it.live("replaces the pins, so removing one leaves the other", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const pinned = yield* Effect.gen(function* () {
        const preferences = yield* PreferencesService
        yield* preferences.setPinnedDefaults({ autonomy: "auto", effort: "high" })
        yield* preferences.setPinnedDefaults({ autonomy: null, effort: "high" })
        return yield* preferences.pinnedDefaults
      }).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(pinned, { autonomy: null, effort: "high" })
    }),
  )

  it.live("reads a stored value it no longer understands as nothing pinned", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const pinned = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`
          INSERT INTO preferences (key, value_json)
          VALUES ('pinned_defaults', '{"autonomy":"yolo","effort":null}')
        `
        const preferences = yield* PreferencesService
        return yield* preferences.pinnedDefaults
      }).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(pinned, NO_PINS)
    }),
  )
})
