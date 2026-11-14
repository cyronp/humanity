import {
  DEFAULT_UPDATE_PREFERENCES,
  NO_PINS,
  PinnedDefaults,
  UpdatePreferences,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

const PINNED_DEFAULTS_KEY = "pinned_defaults"
const UPDATES_KEY = "updates"

const PreferenceRow = Schema.Struct({ value_json: Schema.String })

const PinnedDefaultsJson = Schema.fromJsonString(PinnedDefaults)
const UpdatePreferencesJson = Schema.fromJsonString(UpdatePreferences)

/** The human's own choices that belong to no project or session. */
export class PreferencesService extends Context.Service<
  PreferencesService,
  {
    /** The settings pinned as the start of every new thread; nothing pinned until the human pins. */
    readonly pinnedDefaults: Effect.Effect<PinnedDefaults>
    readonly setPinnedDefaults: (pinned: PinnedDefaults) => Effect.Effect<PinnedDefaults>
    /** How the desktop app looks for updates; `DEFAULT_UPDATE_PREFERENCES` until the human changes it. */
    readonly updates: Effect.Effect<UpdatePreferences>
    readonly setUpdates: (preferences: UpdatePreferences) => Effect.Effect<UpdatePreferences>
  }
>()("humanity/PreferencesService") {
  static readonly layer = Layer.effect(
    PreferencesService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const decode = Schema.decodeEffect(PinnedDefaultsJson)
      const encode = Schema.encodeEffect(PinnedDefaultsJson)

      const selectByKey = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: PreferenceRow,
        execute: (key) => sql`SELECT value_json FROM preferences WHERE key = ${key}`,
      })

      const pinnedDefaults = Effect.gen(function* () {
        const row = yield* selectByKey(PINNED_DEFAULTS_KEY).pipe(Effect.orDie)
        if (Option.isNone(row)) return NO_PINS
        // A value this version no longer understands is no pin, not a broken app.
        return yield* decode(row.value.value_json).pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning("Ignoring unreadable pinned defaults", error.message),
              NO_PINS,
            ),
          ),
        )
      }).pipe(Effect.withSpan("PreferencesService.pinnedDefaults"))

      const setPinnedDefaults = Effect.fn("PreferencesService.setPinnedDefaults")(function* (
        pinned: PinnedDefaults,
      ) {
        const json = yield* encode(pinned).pipe(Effect.orDie)
        yield* sql`
          INSERT INTO preferences (key, value_json) VALUES (${PINNED_DEFAULTS_KEY}, ${json})
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
        `.pipe(Effect.orDie)
        return pinned
      })

      const updates = Effect.gen(function* () {
        const row = yield* selectByKey(UPDATES_KEY).pipe(Effect.orDie)
        if (Option.isNone(row)) return DEFAULT_UPDATE_PREFERENCES
        return yield* Schema.decodeEffect(UpdatePreferencesJson)(row.value.value_json).pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning("Ignoring unreadable update preferences", error.message),
              DEFAULT_UPDATE_PREFERENCES,
            ),
          ),
        )
      }).pipe(Effect.withSpan("PreferencesService.updates"))

      const setUpdates = Effect.fn("PreferencesService.setUpdates")(function* (
        preferences: UpdatePreferences,
      ) {
        const json = yield* Schema.encodeEffect(UpdatePreferencesJson)(preferences).pipe(
          Effect.orDie,
        )
        yield* sql`
          INSERT INTO preferences (key, value_json) VALUES (${UPDATES_KEY}, ${json})
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
        `.pipe(Effect.orDie)
        return preferences
      })

      return PreferencesService.of({ pinnedDefaults, setPinnedDefaults, updates, setUpdates })
    }),
  )
}
