import { Rpc, RpcGroup } from "effect/rpc"
import {
  BrowserPreferences,
  HistoryPreferences,
  PinnedDefaults,
  ToolsPreferences,
} from "../domain/Preferences.ts"
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
  Rpc.make("Preferences.getBrowser", {
    success: BrowserPreferences,
  }),
  Rpc.make("Preferences.setBrowser", {
    payload: { browser: BrowserPreferences },
    success: BrowserPreferences,
  }),
  Rpc.make("Preferences.getTools", {
    success: ToolsPreferences,
  }),
  Rpc.make("Preferences.setTools", {
    payload: { tools: ToolsPreferences },
    success: ToolsPreferences,
  }),
)
