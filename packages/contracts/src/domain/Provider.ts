import { Schema } from "effect"

export const AgentProvider = Schema.Literals(["claude-code", "codex", "kiro", "antigravity"])
export type AgentProvider = typeof AgentProvider.Type

export const DEFAULT_PROVIDER: AgentProvider = "claude-code"

export const ModelDefault = Schema.Struct({
  provider: AgentProvider,
  model: Schema.NullOr(Schema.String),
})
export type ModelDefault = typeof ModelDefault.Type

export const PROVIDER_NAMES: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  kiro: "Kiro",
  antigravity: "Antigravity",
}

export const DEFAULT_ACCOUNT = "default"
