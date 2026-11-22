import {
  type AgentProvider,
  BrowserPreferences,
  CLI_COMMANDS,
  DEFAULT_EDITOR_PREFERENCES,
  EditorPreferences,
  CliPathPreferences,
  DEFAULT_BROWSER_PREFERENCES,
  DEFAULT_CLI_PATH_PREFERENCES,
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
import { setCliOverrides } from "../agent/installedCli.ts"

const applyCliPaths = (paths: CliPathPreferences) =>
  setCliOverrides(
    Object.fromEntries(
      (Object.keys(paths) as Array<AgentProvider>).map((provider) => [
        CLI_COMMANDS[provider],
        paths[provider],
      ]),
    ),
  )

const PreferenceRow = Schema.Struct({ value_json: Schema.String })

interface Stored<A> {
  readonly get: Effect.Effect<A>
  readonly set: (value: A) => Effect.Effect<A>
}

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
    readonly editor: Effect.Effect<EditorPreferences>
    readonly setEditor: (preferences: EditorPreferences) => Effect.Effect<EditorPreferences>
    readonly browser: Effect.Effect<BrowserPreferences>
    readonly setBrowser: (preferences: BrowserPreferences) => Effect.Effect<BrowserPreferences>
    readonly cliPaths: Effect.Effect<CliPathPreferences>
    readonly setCliPaths: (preferences: CliPathPreferences) => Effect.Effect<CliPathPreferences>
  }
>()("humanity/PreferencesService") {
  static readonly layer = Layer.effect(
    PreferencesService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const selectByKey = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: PreferenceRow,
        execute: (key) => sql`SELECT value_json FROM preferences WHERE key = ${key}`,
      })

      const stored = <A, I>(
        key: string,
        schema: Schema.Codec<A, I>,
        fallback: A,
        label: string,
      ): Stored<A> => {
        const json = Schema.fromJsonString(schema)
        const get = Effect.gen(function* () {
          const row = yield* selectByKey(key).pipe(Effect.orDie)
          if (Option.isNone(row)) return fallback
          return yield* Schema.decodeEffect(json)(row.value.value_json).pipe(
            Effect.catch((error) =>
              Effect.as(Effect.logWarning(`Ignoring unreadable ${label}`, error.message), fallback),
            ),
          )
        }).pipe(Effect.withSpan(`PreferencesService.${key}`))
        const set = (value: A) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(json)(value).pipe(Effect.orDie)
            yield* sql`
              INSERT INTO preferences (key, value_json) VALUES (${key}, ${encoded})
              ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json
            `.pipe(Effect.orDie)
            return value
          }).pipe(Effect.withSpan(`PreferencesService.set.${key}`))
        return { get, set }
      }

      const pinned = stored("pinned_defaults", PinnedDefaults, NO_PINS, "pinned defaults")
      const updates = stored(
        "updates",
        UpdatePreferences,
        DEFAULT_UPDATE_PREFERENCES,
        "update preferences",
      )
      const history = stored(
        "history",
        HistoryPreferences,
        DEFAULT_HISTORY_PREFERENCES,
        "history preferences",
      )
      const terminal = stored(
        "terminal",
        TerminalPreferences,
        DEFAULT_TERMINAL_PREFERENCES,
        "terminal preferences",
      )
      const tools = stored(
        "tools",
        ToolsPreferences,
        DEFAULT_TOOLS_PREFERENCES,
        "tools preferences",
      )
      const editor = stored(
        "editor",
        EditorPreferences,
        DEFAULT_EDITOR_PREFERENCES,
        "editor preferences",
      )
      const browser = stored(
        "browser",
        BrowserPreferences,
        DEFAULT_BROWSER_PREFERENCES,
        "browser preferences",
      )
      const cliPaths = stored(
        "cli_paths",
        CliPathPreferences,
        DEFAULT_CLI_PATH_PREFERENCES,
        "CLI paths",
      )

      applyCliPaths(yield* cliPaths.get)

      return PreferencesService.of({
        pinnedDefaults: pinned.get,
        setPinnedDefaults: pinned.set,
        updates: updates.get,
        setUpdates: updates.set,
        history: history.get,
        setHistory: history.set,
        terminal: terminal.get,
        setTerminal: terminal.set,
        tools: tools.get,
        setTools: tools.set,
        editor: editor.get,
        setEditor: editor.set,
        browser: browser.get,
        setBrowser: browser.set,
        cliPaths: cliPaths.get,
        setCliPaths: (paths) =>
          Effect.tap(cliPaths.set(paths), (saved) => Effect.sync(() => applyCliPaths(saved))),
      })
    }),
  )
}
