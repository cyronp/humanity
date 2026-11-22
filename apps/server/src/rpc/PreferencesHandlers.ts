import {
  type AgentProvider,
  type CliPathPreferences,
  CliPathNotFound,
  PreferencesRpcs,
} from "@humanity/contracts"
import { Effect, FileSystem } from "effect"
import { HistoryImport } from "../services/HistoryImport.ts"
import { PreferencesService } from "../services/PreferencesService.ts"

export const PreferencesHandlers = PreferencesRpcs.toLayer(
  Effect.gen(function* () {
    const preferences = yield* PreferencesService
    const imports = yield* HistoryImport
    const fs = yield* FileSystem.FileSystem

    const checkCliPaths = (paths: CliPathPreferences) =>
      Effect.forEach(Object.keys(paths) as Array<AgentProvider>, (provider) =>
        Effect.gen(function* () {
          const path = paths[provider]?.trim() ?? ""
          if (path === "") return [provider, null] as const
          const info = yield* fs.stat(path).pipe(Effect.option)
          if (info._tag === "None" || info.value.type !== "File") {
            return yield* new CliPathNotFound({ path })
          }
          return [provider, path] as const
        }),
      ).pipe(Effect.map((entries) => Object.fromEntries(entries) as CliPathPreferences))
    return PreferencesRpcs.of({
      "Preferences.getPinnedDefaults": () => preferences.pinnedDefaults,
      "Preferences.setPinnedDefaults": ({ pinned }) => preferences.setPinnedDefaults(pinned),
      "Preferences.getHistory": () => preferences.history,
      "Preferences.setHistory": ({ history }) =>
        Effect.tap(preferences.setHistory(history), (saved) =>
          saved.importFromCli ? imports.syncAllInBackground : Effect.void,
        ),
      "Preferences.getTerminal": () => preferences.terminal,
      "Preferences.setTerminal": ({ terminal }) => preferences.setTerminal(terminal),
      "Preferences.getEditor": () => preferences.editor,
      "Preferences.setEditor": ({ editor }) => preferences.setEditor(editor),
      "Preferences.getBrowser": () => preferences.browser,
      "Preferences.setBrowser": ({ browser }) => preferences.setBrowser(browser),
      "Preferences.getTools": () => preferences.tools,
      "Preferences.setTools": ({ tools }) => preferences.setTools(tools),
      "Preferences.getCliPaths": () => preferences.cliPaths,
      "Preferences.setCliPaths": ({ paths }) =>
        Effect.flatMap(checkCliPaths(paths), preferences.setCliPaths),
    })
  }),
)
