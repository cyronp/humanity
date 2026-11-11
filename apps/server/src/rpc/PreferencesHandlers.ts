import { PreferencesRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { PreferencesService } from "../services/PreferencesService.ts"

export const PreferencesHandlers = PreferencesRpcs.toLayer(
  Effect.gen(function* () {
    const preferences = yield* PreferencesService
    return PreferencesRpcs.of({
      "Preferences.getPinnedDefaults": () => preferences.pinnedDefaults,
      "Preferences.setPinnedDefaults": ({ pinned }) => preferences.setPinnedDefaults(pinned),
    })
  }),
)
