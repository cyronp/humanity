import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

/**
 * Variables a parent Claude Code session sets for its own children. If the
 * daemon itself was started from inside Claude Code, passing these on would
 * make the agent's CLI believe it is a nested child of that session.
 */
export const INHERITED_SESSION_VARIABLES: ReadonlyArray<string> = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
]

/**
 * The environment Claude Code runs with. Everything else is passed through
 * unchanged, in particular `CLAUDE_CONFIG_DIR` (where the subscription login
 * lives) and any `ANTHROPIC_*` credential the human configured. Humanity never
 * reads or stores those values; Claude Code does.
 */
export const claudeEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !INHERITED_SESSION_VARIABLES.includes(key)) result[key] = value
  }
  return result
}

/** Where Claude Code keeps its login and settings, as the CLI itself resolves it. */
export const claudeConfigDir = (
  env: Readonly<Record<string, string | undefined>>,
  userHome: string,
): string => {
  const configured = env["CLAUDE_CONFIG_DIR"]?.trim()
  return configured !== undefined && configured !== "" ? configured : join(userHome, ".claude")
}

/** Candidate platform packages, in the order the Agent SDK tries them. */
export const bundledExecutablePackages = (
  platform: NodeJS.Platform,
  arch: string,
): ReadonlyArray<string> => {
  const base = "@anthropic-ai/claude-agent-sdk"
  if (platform === "linux") return [`${base}-linux-${arch}`, `${base}-linux-${arch}-musl`]
  return [`${base}-${platform}-${arch}`]
}

/**
 * The Claude Code executable the Agent SDK runs when no path is given: it ships
 * as an optional platform package next to the SDK. `null` when it is missing.
 */
export const bundledClaudeExecutable = (
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null => {
  const require = createRequire(import.meta.url)
  const binary = platform === "win32" ? "claude.exe" : "claude"
  for (const name of bundledExecutablePackages(platform, arch)) {
    try {
      const path = join(dirname(require.resolve(`${name}/package.json`)), binary)
      if (existsSync(path)) return path
    } catch {
      // Not installed for this platform; try the next candidate.
    }
  }
  return null
}
