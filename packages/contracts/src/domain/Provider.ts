import { Schema } from "effect"

export const AgentProvider = Schema.Literals(["claude-code", "codex", "kiro", "antigravity"])
export type AgentProvider = typeof AgentProvider.Type

export const DEFAULT_PROVIDER: AgentProvider = "claude-code"

export const PROVIDER_NAMES: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  kiro: "Kiro",
  antigravity: "Antigravity",
}

export const DEFAULT_ACCOUNT = "default"
