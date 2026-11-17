import { join } from "node:path"

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

export const claudeEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !INHERITED_SESSION_VARIABLES.includes(key)) result[key] = value
  }
  return result
}

export const claudeConfigDir = (
  env: Readonly<Record<string, string | undefined>>,
  userHome: string,
): string => {
  const configured = env["CLAUDE_CONFIG_DIR"]?.trim()
  return configured !== undefined && configured !== "" ? configured : join(userHome, ".claude")
}
