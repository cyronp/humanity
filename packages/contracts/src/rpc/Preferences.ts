import { Rpc, RpcGroup } from "effect/rpc"
import { HistoryPreferences, PinnedDefaults } from "../domain/Preferences.ts"

export const PreferencesRpcs = RpcGroup.make(
  Rpc.make("Preferences.getPinnedDefaults", {
    success: PinnedDefaults,
  }),
  Rpc.make("Preferences.setPinnedDefaults", {
    payload: { pinned: PinnedDefaults },
    success: PinnedDefaults,
  }),
  Rpc.make("Preferences.getHistory", {
    success: HistoryPreferences,
  }),
  Rpc.make("Preferences.setHistory", {
    payload: { history: HistoryPreferences },
    success: HistoryPreferences,
  }),
)
