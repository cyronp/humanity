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

/** Without the quotes Windows' "Copy as path" puts around a path. */
const unquote = (text: string): string => /^(["'])(.*)\1$/s.exec(text)?.[2]?.trim() ?? text

/** `file:///C:/code/app` → `C:/code/app`, `file:///home/me/app` → `/home/me/app`, `file://server/share` → `\\server\share`. */
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

/**
 * A folder path, as typed on Windows (`C:\code\app`, `\\server\share`), on
 * POSIX (`/home/me/app`) or from the home folder (`~/code/app`, which the
 * daemon expands), quoted or as a `file://` URL. A relative path is not one:
 * it would be read against wherever the daemon happens to run.
 */
export const parseLocalPath = (input: string): string | undefined => {
  const text = unquote(input.trim())
  const path = fromFileUrl(text) ?? text
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])./.test(path) ? path : undefined
}

/** A path being typed, split where it is completed: the folder to list, and the name begun in it. */
export interface FolderQuery {
  /** Everything up to the last separator, separator included: `C:\code\`, `~/`. */
  readonly folder: string
  /** What follows it: the start of a folder's name, or `""` for all of them. */
  readonly prefix: string
}

/**
 * `C:\code\ap` → `C:\code\` and `ap`; `~/` → `~/` and `""`. Only a path as
 * typed, from a root or from `~`: a quoted or `file://` one is not completed.
 */
export const folderQuery = (input: string): FolderQuery | undefined => {
  if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])/.test(input)) return undefined
  const cut = Math.max(input.lastIndexOf("/"), input.lastIndexOf("\\")) + 1
  return { folder: input.slice(0, cut), prefix: input.slice(cut) }
}

/** The path of a folder in `query.folder`, ending with the separator the human typed, to go on into it. */
export const folderPath = (query: FolderQuery, name: string): string =>
  `${query.folder}${name}${query.folder.at(-1) ?? "/"}`

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** The connected GitLab instance and what it lists, when the picker offers GitLab too. */
export interface GitLabChoices {
  readonly host: string
  readonly repos: ReadonlyArray<GitLabRepo>
}

/**
 * What a search looks for in the list: a pasted URL finds the repository it
 * names, and a pasted path, quoted or not, the row that adds its folder.
 */
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
