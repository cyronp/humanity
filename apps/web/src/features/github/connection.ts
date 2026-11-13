import type { GitHubConnection, GitHubTokenSource } from "@humanity/contracts"

export interface GitHubSummary {
  readonly tone: "ok" | "warning" | "error"
  /** One sentence for headings. */
  readonly title: string
}

const SOURCE_PHRASE: Record<GitHubTokenSource, string> = {
  token: "a saved token",
  cli: "the GitHub CLI",
  environment: "GITHUB_TOKEN",
}

export const summarizeGitHub = (connection: GitHubConnection): GitHubSummary => {
  if (connection.source === null) return { tone: "warning", title: "Not connected" }
  const through = SOURCE_PHRASE[connection.source]
  return connection.user === null
    ? { tone: "error", title: `The login from ${through} is not working` }
    : { tone: "ok", title: `Connected as ${connection.user.login} through ${through}` }
}

/** True when the human's repositories can be listed. */
export const isConnected = (connection: GitHubConnection): boolean => connection.user !== null

/**
 * The command that installs the GitHub CLI on the computer the browser runs
 * on, which is the daemon's own. `null` where there is no single command, as
 * on Linux: the install page covers each distribution.
 */
export const installCliCommand = (userAgent: string): string | null => {
  if (/Windows/i.test(userAgent)) return "winget install --id GitHub.cli"
  if (/Mac/i.test(userAgent)) return "brew install gh"
  return null
}
