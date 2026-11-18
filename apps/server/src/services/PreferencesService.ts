import {
  DEFAULT_HISTORY_PREFERENCES,
  DEFAULT_TERMINAL_PREFERENCES,
  DEFAULT_TOOLS_PREFERENCES,
  DEFAULT_UPDATE_PREFERENCES,
  HistoryPreferences,
  NO_PINS,
  PinnedDefaults,
  TerminalPreferences,
  ToolsPreferences,
  UpdatePreferences,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

const PINNED_DEFAULTS_KEY = "pinned_defaults"
const UPDATES_KEY = "updates"
const HISTORY_KEY = "history"
const TERMINAL_KEY = "terminal"
const TOOLS_KEY = "tools"

const PreferenceRow = Schema.Struct({ value_json: Schema.String })

const PinnedDefaultsJson = Schema.fromJsonString(PinnedDefaults)
const UpdatePreferencesJson = Schema.fromJsonString(UpdatePreferences)
const HistoryPreferencesJson = Schema.fromJsonString(HistoryPreferences)
const TerminalPreferencesJson = Schema.fromJsonString(TerminalPreferences)
const ToolsPreferencesJson = Schema.fromJsonString(ToolsPreferences)

export class PreferencesService extends Context.Service<
  PreferencesService,
  {
    readonly pinnedDefaults: Effect.Effect<PinnedDefaults>
    readonly setPinnedDefaults: (pinned: PinnedDefaults) => Effect.Effect<PinnedDefaults>
    readonly updates: Effect.Effect<UpdatePreferences>
    readonly setUpdates: (preferences: UpdatePreferences) => Effect.Effect<UpdatePreferences>
    readonly history: Effect.Effect<HistoryPreferences>
    readonly setHistory: (preferences: HistoryPreferences) => Effect.Effect<HistoryPreferences>
    readonly terminal: Effect.Effect<TerminalPreferences>
    readonly setTerminal: (preferences: TerminalPreferences) => Effect.Effect<TerminalPreferences>
    readonly tools: Effect.Effect<ToolsPreferences>
    readonly setTools: (preferences: ToolsPreferences) => Effect.Effect<ToolsPreferences>
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

      const history = Effect.gen(function* () {
        const row = yield* selectByKey(HISTORY_KEY).pipe(Effect.orDie)
        if (Option.isNone(row)) return DEFAULT_HISTORY_PREFERENCES
        return yield* Schema.decodeEffect(HistoryPreferencesJson)(row.value.value_json).pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning("Ignoring unreadable history preferences", error.message),
              DEFAULT_HISTORY_PREFERENCES,
            ),
          ),
        )
      }).pipe(Effect.withSpan("PreferencesService.history"))

      const setHistory = Effect.fn("PreferencesService.setHistory")(function* (
        preferences: HistoryPreferences,
      ) {
        const json = yield* Schema.encodeEffect(HistoryPreferencesJson)(preferences).pipe(
          Effect.orDie,
        )
        yield* sql`
          INSERT INTO preferences (key, value_json) VALUES (${HISTORY_KEY}, ${json})
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
        `.pipe(Effect.orDie)
        return preferences
      })

      const terminal = Effect.gen(function* () {
        const row = yield* selectByKey(TERMINAL_KEY).pipe(Effect.orDie)
        if (Option.isNone(row)) return DEFAULT_TERMINAL_PREFERENCES
        return yield* Schema.decodeEffect(TerminalPreferencesJson)(row.value.value_json).pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning("Ignoring unreadable terminal preferences", error.message),
              DEFAULT_TERMINAL_PREFERENCES,
            ),
          ),
        )
      }).pipe(Effect.withSpan("PreferencesService.terminal"))

      const setTerminal = Effect.fn("PreferencesService.setTerminal")(function* (
        preferences: TerminalPreferences,
      ) {
        const json = yield* Schema.encodeEffect(TerminalPreferencesJson)(preferences).pipe(
          Effect.orDie,
        )
        yield* sql`
          INSERT INTO preferences (key, value_json) VALUES (${TERMINAL_KEY}, ${json})
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
        `.pipe(Effect.orDie)
        return preferences
      })

      const tools = Effect.gen(function* () {
        const row = yield* selectByKey(TOOLS_KEY).pipe(Effect.orDie)
        if (Option.isNone(row)) return DEFAULT_TOOLS_PREFERENCES
        return yield* Schema.decodeEffect(ToolsPreferencesJson)(row.value.value_json).pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning("Ignoring unreadable tools preferences", error.message),
              DEFAULT_TOOLS_PREFERENCES,
            ),
          ),
        )
      }).pipe(Effect.withSpan("PreferencesService.tools"))

      const setTools = Effect.fn("PreferencesService.setTools")(function* (
        preferences: ToolsPreferences,
      ) {
        const json = yield* Schema.encodeEffect(ToolsPreferencesJson)(preferences).pipe(
          Effect.orDie,
        )
        yield* sql`
          INSERT INTO preferences (key, value_json) VALUES (${TOOLS_KEY}, ${json})
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
        `.pipe(Effect.orDie)
        return preferences
      })

      return PreferencesService.of({
        pinnedDefaults,
        setPinnedDefaults,
        updates,
        setUpdates,
        history,
        setHistory,
        terminal,
        setTerminal,
        tools,
        setTools,
      })
    }),
  )
}
