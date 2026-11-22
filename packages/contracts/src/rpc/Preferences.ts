import { Rpc, RpcGroup } from "effect/rpc"
import {
  BrowserPreferences,
  CliPathPreferences,
  HistoryPreferences,
  PinnedDefaults,
  ToolsPreferences,
} from "../domain/Preferences.ts"
import { EditorPreferences } from "../domain/Files.ts"
import { TerminalPreferences } from "../domain/Terminal.ts"
import { CliPathNotFound } from "../Errors.ts"

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
  Rpc.make("Preferences.getEditor", {
    success: EditorPreferences,
  }),
  Rpc.make("Preferences.setEditor", {
    payload: { editor: EditorPreferences },
    success: EditorPreferences,
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
  Rpc.make("Preferences.getCliPaths", {
    success: CliPathPreferences,
  }),
  Rpc.make("Preferences.setCliPaths", {
    payload: { paths: CliPathPreferences },
    success: CliPathPreferences,
    error: CliPathNotFound,
  }),
)
