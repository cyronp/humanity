import {
  GITLAB_DEFAULT_HOST,
  type GitLabConnection,
  type GitLabTokenSource,
} from "@humanity/contracts"

export interface GitLabSummary {
  readonly tone: "ok" | "warning" | "error"
  /** One sentence for headings. */
  readonly title: string
}

const SOURCE_PHRASE: Record<GitLabTokenSource, string> = {
  token: "a saved token",
  cli: "the GitLab CLI",
  environment: "GITLAB_TOKEN",
}

/** How a way to connect is named in a sentence. */
export const gitlabSourcePhrase = (source: GitLabTokenSource): string => SOURCE_PHRASE[source]

export const summarizeGitLab = (connection: GitLabConnection): GitLabSummary => {
  if (connection.source === null) return { tone: "warning", title: "Not connected" }
  const through = SOURCE_PHRASE[connection.source]
  // Only an instance of their own is worth naming; gitlab.com is what "GitLab" already says.
  const where = connection.host === GITLAB_DEFAULT_HOST ? "" : ` on ${connection.host}`
  return connection.user === null
    ? { tone: "error", title: `The login from ${through}${where} is not working` }
    : { tone: "ok", title: `Connected as ${connection.user.username}${where} through ${through}` }
}

/** True when the human's repositories can be listed. */
export const isGitLabConnected = (connection: GitLabConnection): boolean => connection.user !== null

/**
 * The command that installs the GitLab CLI on the computer the browser runs
 * on, which is the daemon's own. `null` where there is no single command, as
 * on Linux: the install page covers each distribution.
 */
export const installGlabCommand = (userAgent: string): string | null => {
  if (/Windows/i.test(userAgent)) return "winget install glab.glab"
  if (/Mac/i.test(userAgent)) return "brew install glab"
  return null
}

/** Where a personal access token is created on the instance at `host`. */
export const newGitLabTokenUrl = (host: string): string =>
  `https://${host}/-/user_settings/personal_access_tokens`
