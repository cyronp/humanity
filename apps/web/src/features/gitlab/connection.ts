import {
  GITLAB_DEFAULT_HOST,
  type GitLabConnection,
  type GitLabTokenSource,
} from "@humanity/contracts"

export interface GitLabSummary {
  readonly tone: "ok" | "warning" | "error"
  readonly title: string
}

const SOURCE_PHRASE: Record<GitLabTokenSource, string> = {
  token: "a saved token",
  cli: "the GitLab CLI",
  environment: "GITLAB_TOKEN",
}

export const gitlabSourcePhrase = (source: GitLabTokenSource): string => SOURCE_PHRASE[source]

export const summarizeGitLab = (connection: GitLabConnection): GitLabSummary => {
  if (connection.source === null) return { tone: "warning", title: "Not connected" }
  const through = SOURCE_PHRASE[connection.source]
  const where = connection.host === GITLAB_DEFAULT_HOST ? "" : ` on ${connection.host}`
  return connection.user === null
    ? { tone: "error", title: `The login from ${through}${where} is not working` }
    : { tone: "ok", title: `Connected as ${connection.user.username}${where} through ${through}` }
}

export const isGitLabConnected = (connection: GitLabConnection): boolean => connection.user !== null

export const installGlabCommand = (userAgent: string): string | null => {
  if (/Windows/i.test(userAgent)) return "winget install glab.glab"
  if (/Mac/i.test(userAgent)) return "brew install glab"
  return null
}

export const newGitLabTokenUrl = (host: string): string =>
  `https://${host}/-/user_settings/personal_access_tokens`
