import { assert, describe, it } from "@effect/vitest"
import {
  DEFAULT_BROWSER_PREFERENCES,
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_TERMINAL_PREFERENCES,
  DEFAULT_TOOLS_PREFERENCES,
  NO_PINS,
  type PinnedDefaults,
} from "@humanity/contracts"
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
      const pins: PinnedDefaults = { autonomy: "ask", effort: "default", model: null }

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
        yield* preferences.setPinnedDefaults({ autonomy: "auto", effort: "high", model: null })
        yield* preferences.setPinnedDefaults({ autonomy: null, effort: "high", model: null })
        return yield* preferences.pinnedDefaults
      }).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(pinned, { autonomy: null, effort: "high", model: null })
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

  it.live("offers every Humanity tool until the human turns one off, and keeps the choice", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const initial = yield* PreferencesService.use((preferences) => preferences.tools).pipe(
        Effect.provide(services(home)),
      )
      assert.deepStrictEqual(initial, DEFAULT_TOOLS_PREFERENCES)
      assert.deepStrictEqual(initial, { terminals: true, openThread: true, skills: true })

      yield* PreferencesService.use((preferences) =>
        preferences.setTools({ terminals: false, openThread: true, skills: true }),
      ).pipe(Effect.provide(services(home)))
      const restored = yield* PreferencesService.use((preferences) => preferences.tools).pipe(
        Effect.provide(services(home)),
      )
      assert.deepStrictEqual(restored, { terminals: false, openThread: true, skills: true })
    }),
  )

  it.live("keeps the tools saved before skills had a switch, with skills on", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const tools = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`
          INSERT INTO preferences (key, value_json)
          VALUES ('tools', '{"terminals":false,"openThread":true}')
        `
        return yield* PreferencesService.use((preferences) => preferences.tools)
      }).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(tools, { terminals: false, openThread: true, skills: true })
    }),
  )

  it.live("keeps pins saved before a model could be pinned, with no model pinned", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const pinned = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`
          INSERT INTO preferences (key, value_json)
          VALUES ('pinned_defaults', '{"autonomy":"ask","effort":"high"}')
        `
        return yield* PreferencesService.use((preferences) => preferences.pinnedDefaults)
      }).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(pinned, { autonomy: "ask", effort: "high", model: null })
    }),
  )

  it.live("keeps terminal and Browser settings saved before the new ones, with defaults", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const [terminal, browser] = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`
          INSERT INTO preferences (key, value_json)
          VALUES ('terminal', '{"shell":"bash","fontSize":15,"scrollback":2000}'),
            ('browser', '{"linkTarget":"system"}')
        `
        const preferences = yield* PreferencesService
        return [yield* preferences.terminal, yield* preferences.browser] as const
      }).pipe(Effect.provide(services(home)))

      assert.deepStrictEqual(terminal, {
        ...DEFAULT_TERMINAL_PREFERENCES,
        shell: "bash",
        fontSize: 15,
        scrollback: 2000,
      })
      assert.deepStrictEqual(browser, { ...DEFAULT_BROWSER_PREFERENCES, linkTarget: "system" })
    }),
  )

  it.live("keeps the editor settings, and fills in the ones saved before them", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const editor = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`
          INSERT INTO preferences (key, value_json)
          VALUES ('editor', '{"autoSave":"afterDelay","tabSize":4}')
        `
        return yield* PreferencesService.use((preferences) => preferences.editor)
      }).pipe(Effect.provide(services(home)))
      assert.deepStrictEqual(editor, {
        ...DEFAULT_EDITOR_PREFERENCES,
        autoSave: "afterDelay",
        tabSize: 4,
      })

      const saved = { ...DEFAULT_EDITOR_PREFERENCES, wordWrap: true, fontSize: 15 }
      yield* PreferencesService.use((preferences) => preferences.setEditor(saved)).pipe(
        Effect.provide(services(home)),
      )
      const reread = yield* PreferencesService.use((preferences) => preferences.editor).pipe(
        Effect.provide(services(home)),
      )
      assert.deepStrictEqual(reread, saved)
    }),
  )

  it.live("keeps the CLI paths across daemon restarts", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const paths = {
        "claude-code": "/opt/claude/bin/claude",
        codex: null,
        kiro: null,
        antigravity: null,
      }
      yield* PreferencesService.use((preferences) => preferences.setCliPaths(paths)).pipe(
        Effect.provide(services(home)),
      )
      const restored = yield* PreferencesService.use((preferences) => preferences.cliPaths).pipe(
        Effect.provide(services(home)),
      )
      yield* PreferencesService.use((preferences) =>
        preferences.setCliPaths({ ...paths, "claude-code": null }),
      ).pipe(Effect.provide(services(home)))
      assert.deepStrictEqual(restored, paths)
    }),
  )
})
