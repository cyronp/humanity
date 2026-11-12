import type { ClaudeStatus } from "@humanity/contracts"

export type ClaudeTone = "ok" | "warning" | "error"

export interface ClaudeSummary {
  readonly tone: ClaudeTone
  /** Two or three words for the header badge. */
  readonly short: string
  /** One sentence for headings. */
  readonly title: string
}

/** What a status means for the human, in the words the UI uses everywhere. */
export const summarizeClaude = (status: ClaudeStatus): ClaudeSummary => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      if (connection.subscriptionShadowed) {
        return {
          tone: "warning",
          short: "API key in use",
          title: "Claude is using an API key instead of your subscription",
        }
      }
      if (connection.method === "subscription") {
        return { tone: "ok", short: connection.label, title: "Connected to your Claude account" }
      }
      return {
        tone: "ok",
        short: connection.method === "apiKey" ? "API key" : connection.label,
        title:
          connection.method === "apiKey"
            ? "Connected with an Anthropic API key"
            : `Connected through ${connection.label}`,
      }
    case "SignedOut":
      return { tone: "warning", short: "Sign in to Claude", title: "Claude Code is not signed in" }
    case "Unavailable":
      return {
        tone: "error",
        short: "Claude unavailable",
        title: "Claude Code could not be started",
      }
  }
}

/** True when agent sessions can start: Claude Code has a credential to use. */
export const isReady = (status: ClaudeStatus): boolean => status.connection._tag === "Connected"

const quotePosix = (value: string): string => `"${value.replaceAll('"', '\\"')}"`

/**
 * The command that signs an account in. `configDir` is the config folder of an
 * added account (`null` for Claude Code's default login) and `executable` the
 * CLI bundled with Humanity (`null` for a global `claude`). A Windows path
 * gets a PowerShell command, the default shell there, which sets the folder
 * only for the login and clears it again.
 */
export const signInCommand = (options: {
  readonly configDir: string | null
  readonly executable: string | null
}): string => {
  const { configDir, executable } = options
  const windows = /\\|\.exe$/i.test(executable ?? configDir ?? "")
  if (windows) {
    const login = executable === null ? "claude auth login" : `& "${executable}" auth login`
    return configDir === null
      ? login
      : `$env:CLAUDE_CONFIG_DIR = "${configDir}"; ${login}; Remove-Item Env:CLAUDE_CONFIG_DIR`
  }
  const login = `${executable === null ? "claude" : quotePosix(executable)} auth login`
  return configDir === null ? login : `CLAUDE_CONFIG_DIR=${quotePosix(configDir)} ${login}`
}

export interface ClaudeFact {
  readonly label: string
  readonly value: string
}

/** Who a connected account is, as label and value pairs. Empty when it is not connected. */
export const connectionFacts = (status: ClaudeStatus): ReadonlyArray<ClaudeFact> => {
  const connection = status.connection
  if (connection._tag !== "Connected") return []
  return [
    {
      label: connection.method === "subscription" ? "Plan" : "Credential",
      value: connection.label,
    },
    ...(connection.email === null ? [] : [{ label: "Signed in as", value: connection.email }]),
    ...(connection.organization === null
      ? []
      : [{ label: "Organization", value: connection.organization }]),
  ]
}

/** One line saying what an account is: its plan and login, or why it cannot run sessions. */
export const accountLine = (status: ClaudeStatus): string => {
  const summary = summarizeClaude(status)
  const connection = status.connection
  if (connection._tag !== "Connected") return summary.title
  return connection.email === null ? summary.short : `${summary.short} · ${connection.email}`
}
