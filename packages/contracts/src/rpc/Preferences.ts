import { Rpc, RpcGroup } from "effect/rpc"
import { PinnedDefaults } from "../domain/Preferences.ts"

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
)
