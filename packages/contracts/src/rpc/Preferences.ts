import { Rpc, RpcGroup } from "effect/rpc"
import { HistoryPreferences, PinnedDefaults } from "../domain/Preferences.ts"

/** Choices of the human that hold across projects, browsers and daemon restarts. */
export const PreferencesRpcs = RpcGroup.make(
  Rpc.make("Preferences.getPinnedDefaults", {
    success: PinnedDefaults,
  }),
  /** Replaces the pins. Threads that already exist keep their own settings. */
  Rpc.make("Preferences.setPinnedDefaults", {
    payload: { pinned: PinnedDefaults },
    success: PinnedDefaults,
  }),
  Rpc.make("Preferences.getHistory", {
    success: HistoryPreferences,
  }),
  /** Turning the import on brings the CLI's conversations in right away; off keeps the threads already imported. */
  Rpc.make("Preferences.setHistory", {
    payload: { history: HistoryPreferences },
    success: HistoryPreferences,
  }),
)
