import type { GitHubRepo, Project } from "@humanity/contracts"

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

/** An absolute folder path, as typed on Windows (`C:\code\app`, `\\server\share`) or POSIX (`/home/me/app`). */
export const parseLocalPath = (input: string): string | undefined => {
  const trimmed = input.trim()
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)./.test(trimmed) ? trimmed : undefined
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** What a search looks for in the list: a pasted URL finds the repository it names. */
export const repoNeedle = (search: string): string =>
  (parseRepoInput(search) ?? search.trim()).toLowerCase()

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
  /** A folder on this computer. */
  | { readonly kind: "local"; readonly path: string }
  /** A repository that already is a project. */
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
): TypedChoice | undefined => {
  const path = parseLocalPath(search)
  if (path !== undefined) return { kind: "local", path }
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
