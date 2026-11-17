import type { ClaudeStatus } from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

export interface ClaudeSummary {
  readonly short: string
  readonly title: string
}

export const summarizeClaude = (status: ClaudeStatus): ClaudeSummary => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      if (connection.subscriptionShadowed) {
        return {
          short: "API key in use",
          title: "Claude is using an API key instead of your subscription",
        }
      }
      if (connection.method === "subscription") {
        return { short: connection.label, title: "Connected to your Claude account" }
      }
      return {
        short: connection.method === "apiKey" ? "API key" : connection.label,
        title:
          connection.method === "apiKey"
            ? "Connected with an Anthropic API key"
            : `Connected through ${connection.label}`,
      }
    case "SignedOut":
      return { short: "Sign in to Claude", title: "Claude Code is not signed in" }
    case "Unavailable":
      return {
        short: "Claude unavailable",
        title: "Claude Code could not be started",
      }
  }
}

export const isReady = (status: ClaudeStatus): boolean => status.connection._tag === "Connected"

export const signInCommand = (options: {
  readonly configDir: string | null
  readonly executable: string | null
}): string => {
  const { configDir, executable } = options
  const login = `${executable === null ? "claude" : callExecutable(executable)} auth login`
  if (configDir === null) return login
  return isWindowsPath(executable ?? configDir)
    ? `$env:CLAUDE_CONFIG_DIR = ${quotePowerShell(configDir)}; ${login}; Remove-Item Env:CLAUDE_CONFIG_DIR`
    : `CLAUDE_CONFIG_DIR=${quotePosix(configDir)} ${login}`
}

export interface ClaudeFact {
  readonly label: string
  readonly value: string
}

export const connectionFacts = (status: ClaudeStatus): ReadonlyArray<ClaudeFact> => {
  const connection = status.connection
  if (connection._tag !== "Connected") return []
  return [
    {
      label: connection.method === "subscription" ? "Plan" : "Credential",
      value: connection.label,
    },
    ...(connection.email === null ? [] : [{ label: "Authenticated as", value: connection.email }]),
    ...(connection.organization === null
      ? []
      : [{ label: "Organization", value: connection.organization }]),
  ]
}

export const accountLine = (status: ClaudeStatus): string => {
  const summary = summarizeClaude(status)
  const connection = status.connection
  if (connection._tag !== "Connected") return summary.title
  return connection.email === null ? summary.short : `${summary.short} · ${connection.email}`
}
