import { Schema } from "effect"

/**
 * The agent a thread runs on: Claude Code through the Claude Agent SDK, or
 * OpenAI's Codex through its app server. A thread keeps its provider for
 * good, because its conversation is stored by that provider.
 */
export const AgentProvider = Schema.Literals(["claude-code", "codex"])
export type AgentProvider = typeof AgentProvider.Type

export const DEFAULT_PROVIDER: AgentProvider = "claude-code"

/**
 * The id of the login a provider's CLI uses by itself, in its own folder.
 * Every provider has it, it cannot be removed, and it is the account of new
 * threads until the human picks another.
 */
export const DEFAULT_ACCOUNT = "default"
