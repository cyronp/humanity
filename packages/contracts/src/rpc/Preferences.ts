import { Rpc, RpcGroup } from "effect/rpc"
import { HistoryPreferences, PinnedDefaults, ToolsPreferences } from "../domain/Preferences.ts"
import { TerminalPreferences } from "../domain/Terminal.ts"

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
  Rpc.make("Preferences.getTerminal", {
    success: TerminalPreferences,
  }),
  Rpc.make("Preferences.setTerminal", {
    payload: { terminal: TerminalPreferences },
    success: TerminalPreferences,
  }),
  Rpc.make("Preferences.getTools", {
    success: ToolsPreferences,
  }),
  Rpc.make("Preferences.setTools", {
    payload: { tools: ToolsPreferences },
    success: ToolsPreferences,
  }),
)
