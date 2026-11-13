import { Schema } from "effect"
import { QUESTION_TOOL } from "./Question.ts"

/**
 * How much autonomy a tool gets. Unknown tools always resolve to `confirm`,
 * never to `auto`.
 */
export const ToolMode = Schema.Literals(["auto", "review", "confirm", "deny"])
export type ToolMode = typeof ToolMode.Type

/**
 * One row of a project's policy table. `pattern` is either an exact tool name
 * (`Bash`) or a prefix wildcard (`mcp__*`, `mcp__github__*`).
 */
export const ToolRule = Schema.Struct({
  pattern: Schema.NonEmptyString,
  mode: ToolMode,
})
export type ToolRule = typeof ToolRule.Type

export const ToolPolicy = Schema.Struct({
  rules: Schema.Array(ToolRule),
})
export type ToolPolicy = typeof ToolPolicy.Type

/** Humanity's own MCP server, running inside the daemon: the tools the app itself gives the agent. */
export const HUMANITY_MCP_SERVER = "humanity"

/** The server's tool that opens a new thread, by the short name the server registers. */
export const OPEN_THREAD_TOOL_NAME = "open_thread"

/** The same tool as the agent calls it and as the policy names it. */
export const OPEN_THREAD_TOOL = `mcp__${HUMANITY_MCP_SERVER}__${OPEN_THREAD_TOOL_NAME}`

/** Mode used for any tool that no rule matches. */
export const FALLBACK_TOOL_MODE: ToolMode = "confirm"

export const DEFAULT_TOOL_POLICY: ToolPolicy = {
  rules: [
    // Read-only built-ins and the agent's own bookkeeping.
    { pattern: "Read", mode: "auto" },
    { pattern: "Glob", mode: "auto" },
    { pattern: "Grep", mode: "auto" },
    { pattern: "TodoWrite", mode: "auto" },
    { pattern: "Skill", mode: "auto" },
    // File-mutating built-ins.
    { pattern: "Edit", mode: "review" },
    { pattern: "Write", mode: "review" },
    { pattern: "NotebookEdit", mode: "review" },
    // Anything with side effects beyond the worktree's files.
    { pattern: "Bash", mode: "confirm" },
    { pattern: "PowerShell", mode: "confirm" },
    { pattern: "WebFetch", mode: "confirm" },
    { pattern: "WebSearch", mode: "confirm" },
    { pattern: "mcp__*", mode: "confirm" },
    // Humanity's own tool: the new thread is a thread like any other, under this same policy.
    { pattern: OPEN_THREAD_TOOL, mode: "auto" },
  ],
}

const isWildcard = (pattern: string) => pattern.endsWith("*")

const matches = (pattern: string, toolName: string): boolean =>
  isWildcard(pattern) ? toolName.startsWith(pattern.slice(0, -1)) : pattern === toolName

/**
 * Resolve a tool name to its mode. An exact rule beats a wildcard, a longer
 * wildcard beats a shorter one, and no match means `confirm`. A question for
 * the human always reaches the human, unless the policy denies it.
 */
export const resolveToolMode = (policy: ToolPolicy, toolName: string): ToolMode => {
  const mode = resolveRule(policy, toolName)
  return toolName === QUESTION_TOOL && mode !== "deny" ? "confirm" : mode
}

const resolveRule = (policy: ToolPolicy, toolName: string): ToolMode => {
  let best: ToolRule | undefined
  for (const rule of policy.rules) {
    if (!matches(rule.pattern, toolName)) continue
    if (!isWildcard(rule.pattern)) return rule.mode
    if (best === undefined || rule.pattern.length > best.pattern.length) best = rule
  }
  return best?.mode ?? FALLBACK_TOOL_MODE
}

/**
 * How much a session's agent may do without the human, chosen per session on
 * top of the project's policy. Humanity's own presets, not the SDK's
 * permission modes: every call still reaches Humanity's permission check, and
 * `deny` rules always hold.
 *
 * - `ask`: the project's policy as it is.
 * - `accept_edits`: `review` tools change files inside the worktree without a review.
 * - `auto` ("Auto mode"): `review` and `confirm` tools both run without asking.
 */
export const Autonomy = Schema.Literals(["ask", "accept_edits", "auto"])
export type Autonomy = typeof Autonomy.Type

export const DEFAULT_AUTONOMY: Autonomy = "ask"

/** The mode a call gets once the session's autonomy is applied to the project's mode. */
export const applyAutonomy = (autonomy: Autonomy, mode: ToolMode): ToolMode => {
  switch (autonomy) {
    case "ask":
      return mode
    case "accept_edits":
      return mode === "review" ? "auto" : mode
    case "auto":
      return mode === "review" || mode === "confirm" ? "auto" : mode
  }
}

/** Returns a policy where `pattern` maps to `mode`, replacing an existing rule for it. */
export const setToolRule = (policy: ToolPolicy, pattern: string, mode: ToolMode): ToolPolicy => {
  const exists = policy.rules.some((rule) => rule.pattern === pattern)
  return {
    rules: exists
      ? policy.rules.map((rule) => (rule.pattern === pattern ? { pattern, mode } : rule))
      : [...policy.rules, { pattern, mode }],
  }
}

/** Splits `mcp__<server>__<tool>` into its parts. */
export const parseMcpToolName = (
  toolName: string,
): { readonly server: string; readonly tool: string } | undefined => {
  if (!toolName.startsWith("mcp__")) return undefined
  const rest = toolName.slice("mcp__".length)
  const separator = rest.indexOf("__")
  if (separator <= 0) return undefined
  return { server: rest.slice(0, separator), tool: rest.slice(separator + 2) }
}
