import { PreferencesRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { HistoryImport } from "../services/HistoryImport.ts"
import { PreferencesService } from "../services/PreferencesService.ts"

export const PreferencesHandlers = PreferencesRpcs.toLayer(
  Effect.gen(function* () {
    const preferences = yield* PreferencesService
    const imports = yield* HistoryImport
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
      "Preferences.getBrowser": () => preferences.browser,
      "Preferences.setBrowser": ({ browser }) => preferences.setBrowser(browser),
      "Preferences.getTools": () => preferences.tools,
      "Preferences.setTools": ({ tools }) => preferences.setTools(tools),
    })
  }),
)
