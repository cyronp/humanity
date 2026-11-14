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
      // Turned on: the conversations of the CLI follow now, not at the next sync.
      "Preferences.setHistory": ({ history }) =>
        Effect.tap(preferences.setHistory(history), (saved) =>
          saved.importFromCli ? imports.syncAllInBackground : Effect.void,
        ),
    })
  }),
)
