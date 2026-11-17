import {
  GITLAB_FULL_PATH_PATTERN,
  type GitHubRepo,
  type GitLabRepo,
  type Project,
} from "@humanity/contracts"

const FULL_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/

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

const unquote = (text: string): string => /^(["'])(.*)\1$/s.exec(text)?.[2]?.trim() ?? text

const fromFileUrl = (text: string): string | undefined => {
  if (!/^file:\/\//i.test(text)) return undefined
  try {
    const url = new URL(text)
    const path = decodeURIComponent(url.pathname)
    if (url.hostname !== "" && url.hostname !== "localhost") {
      return `\\\\${url.hostname}${path.replaceAll("/", "\\")}`
    }
    return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path
  } catch {
    return undefined
  }
}

export const parseLocalPath = (input: string): string | undefined => {
  const text = unquote(input.trim())
  const path = fromFileUrl(text) ?? text
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])./.test(path) ? path : undefined
}

export interface FolderQuery {
  readonly folder: string
  readonly prefix: string
}

export const folderQuery = (input: string): FolderQuery | undefined => {
  if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])/.test(input)) return undefined
  const cut = Math.max(input.lastIndexOf("/"), input.lastIndexOf("\\")) + 1
  return { folder: input.slice(0, cut), prefix: input.slice(cut) }
}

export const folderPath = (query: FolderQuery, name: string): string =>
  `${query.folder}${name}${query.folder.at(-1) ?? "/"}`

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export interface GitLabChoices {
  readonly host: string
  readonly repos: ReadonlyArray<GitLabRepo>
}

export const repoNeedle = (search: string, gitlabHost?: string): string =>
  (
    parseLocalPath(search) ??
    (gitlabHost === undefined ? undefined : parseGitLabInput(search, gitlabHost)) ??
    parseRepoInput(search) ??
    search.trim()
  ).toLowerCase()

const isGitLabProject = (project: Project, host: string, fullPath: string): boolean =>
  project.gitlab !== null &&
  withoutPort(project.gitlab.host) === withoutPort(host) &&
  sameName(project.gitlab.fullPath, fullPath)

export const addableGitLabRepos = (
  repos: ReadonlyArray<GitLabRepo>,
  projects: ReadonlyArray<Project>,
  host: string,
): ReadonlyArray<GitLabRepo> =>
  repos.filter((repo) => !projects.some((project) => isGitLabProject(project, host, repo.fullPath)))

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
  | { readonly kind: "clone"; readonly fullName: string }
  | { readonly kind: "cloneGitLab"; readonly fullPath: string }
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "added"; readonly project: Project }

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
