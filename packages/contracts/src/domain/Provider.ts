import { Schema } from "effect"

/**
 * The agent a thread runs on: Claude Code through the Claude Agent SDK,
 * OpenAI's Codex through its app server, or Kiro (Beta) through its ACP
 * server. A thread keeps its provider for good, because its conversation is
 * stored by that provider.
 */
export const AgentProvider = Schema.Literals(["claude-code", "codex", "kiro"])
export type AgentProvider = typeof AgentProvider.Type

export const DEFAULT_PROVIDER: AgentProvider = "claude-code"

/** Each provider as the human knows it. */
export const PROVIDER_NAMES: Readonly<Record<AgentProvider, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  kiro: "Kiro",
}

/**
 * The id of the login a provider's CLI uses by itself, in its own folder.
 * Every provider has it, it cannot be removed, and it is the account of new
 * threads until the human picks another.
 */
export const DEFAULT_ACCOUNT = "default"
