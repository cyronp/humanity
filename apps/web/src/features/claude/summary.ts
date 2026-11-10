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

/**
 * The login command for the CLI bundled with Humanity, for people without a
 * global `claude`. On Windows it is written for PowerShell, the default shell.
 */
export const bundledLoginCommand = (executable: string): string =>
  /\\|\.exe$/i.test(executable)
    ? `& "${executable}" auth login`
    : `"${executable.replaceAll('"', '\\"')}" auth login`
