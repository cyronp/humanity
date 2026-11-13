import {
  GITLAB_FULL_PATH_PATTERN,
  type GitHubRepo,
  type GitLabRepo,
  type Project,
} from "@humanity/contracts"

const FULL_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/

/** `https://github.com/acme/widgets(.git)` or `acme/widgets` → `acme/widgets` */
export const parseRepoInput = (input: string): string | undefined => {
  const trimmed = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
  const fromUrl = /github\.com[/:]([^/\s]+\/[^/\s]+)$/.exec(trimmed)?.[1]
  const candidate = fromUrl ?? trimmed
  return FULL_NAME.test(candidate) ? candidate : undefined
}

const withoutPort = (host: string): string => host.replace(/:\d+$/, "").toLowerCase()

/**
 * `https://gitlab.com/acme/tools/widgets(.git)`, the same without the scheme,
 * or its ssh form → `acme/tools/widgets`, when it is on the GitLab instance at
 * `host`. A bare `group/name` is never GitLab's: that spelling is GitHub's.
 */
export const parseGitLabInput = (input: string, host: string): string | undefined => {
  const trimmed = input
    .trim()
    .replace(/\/$/, "")
    .replace(/\.git$/, "")
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?[:/](\S+)$/i.exec(trimmed)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  if (match[1].toLowerCase() !== withoutPort(host)) return undefined
  return GITLAB_FULL_PATH_PATTERN.test(match[2]) ? match[2] : undefined
}

/** An absolute folder path, as typed on Windows (`C:\code\app`, `\\server\share`) or POSIX (`/home/me/app`). */
export const parseLocalPath = (input: string): string | undefined => {
  const trimmed = input.trim()
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)./.test(trimmed) ? trimmed : undefined
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** The connected GitLab instance and what it lists, when the picker offers GitLab too. */
export interface GitLabChoices {
  readonly host: string
  readonly repos: ReadonlyArray<GitLabRepo>
}

/** What a search looks for in the list: a pasted URL finds the repository it names. */
export const repoNeedle = (search: string, gitlabHost?: string): string =>
  (
    (gitlabHost === undefined ? undefined : parseGitLabInput(search, gitlabHost)) ??
    parseRepoInput(search) ??
    search.trim()
  ).toLowerCase()

const isGitLabProject = (project: Project, host: string, fullPath: string): boolean =>
  project.gitlab !== null &&
  withoutPort(project.gitlab.host) === withoutPort(host) &&
  sameName(project.gitlab.fullPath, fullPath)

/** The same for the repositories of the GitLab instance at `host`. */
export const addableGitLabRepos = (
  repos: ReadonlyArray<GitLabRepo>,
  projects: ReadonlyArray<Project>,
  host: string,
): ReadonlyArray<GitLabRepo> =>
  repos.filter((repo) => !projects.some((project) => isGitLabProject(project, host, repo.fullPath)))

/** The repositories that can still be added: those no project was cloned or added from yet. */
export const addableRepos = (
  repos: ReadonlyArray<GitHubRepo>,
  projects: ReadonlyArray<Project>,
): ReadonlyArray<GitHubRepo> =>
  repos.filter(
    (repo) =>
      !projects.some(
        (project) =>
          project.githubFullName !== null && sameName(project.githubFullName, repo.fullName),
      ),
  )

export type TypedChoice =
  /** A repository named by `owner/repo` or its URL that the list does not offer. */
  | { readonly kind: "clone"; readonly fullName: string }
  /** A repository of the connected GitLab instance, named by its URL, that the list does not offer. */
  | { readonly kind: "cloneGitLab"; readonly fullPath: string }
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "added"; readonly project: Project }

/**
 * What the typed text itself offers, next to the listed repositories: cloning
 * a repository by name, adding a local folder, or opening the project a named
 * repository already is. `undefined` when the text is neither, or names a
 * repository the list already shows.
 */
export const typedChoice = (
  search: string,
  repos: ReadonlyArray<GitHubRepo>,
  projects: ReadonlyArray<Project>,
  gitlab?: GitLabChoices,
): TypedChoice | undefined => {
  const path = parseLocalPath(search)
  if (path !== undefined) return { kind: "local", path }
  const fullPath = gitlab === undefined ? undefined : parseGitLabInput(search, gitlab.host)
  if (gitlab !== undefined && fullPath !== undefined) {
    const added = projects.find((candidate) => isGitLabProject(candidate, gitlab.host, fullPath))
    if (added !== undefined) return { kind: "added", project: added }
    return gitlab.repos.some((repo) => sameName(repo.fullPath, fullPath))
      ? undefined
      : { kind: "cloneGitLab", fullPath }
  }
  const fullName = parseRepoInput(search)
  if (fullName === undefined) return undefined
  const project = projects.find(
    (candidate) =>
      candidate.githubFullName !== null && sameName(candidate.githubFullName, fullName),
  )
  if (project !== undefined) return { kind: "added", project }
  return repos.some((repo) => sameName(repo.fullName, fullName))
    ? undefined
    : { kind: "clone", fullName }
}
