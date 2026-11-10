import { Schema } from "effect"

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
  ],
}

const isWildcard = (pattern: string) => pattern.endsWith("*")

const matches = (pattern: string, toolName: string): boolean =>
  isWildcard(pattern) ? toolName.startsWith(pattern.slice(0, -1)) : pattern === toolName

/**
 * Resolve a tool name to its mode. An exact rule beats a wildcard, a longer
 * wildcard beats a shorter one, and no match means `confirm`.
 */
export const resolveToolMode = (policy: ToolPolicy, toolName: string): ToolMode => {
  let best: ToolRule | undefined
  for (const rule of policy.rules) {
    if (!matches(rule.pattern, toolName)) continue
    if (!isWildcard(rule.pattern)) return rule.mode
    if (best === undefined || rule.pattern.length > best.pattern.length) best = rule
  }
  return best?.mode ?? FALLBACK_TOOL_MODE
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
