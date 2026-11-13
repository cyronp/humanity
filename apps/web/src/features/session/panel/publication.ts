import type {
  Branch,
  BranchPublication,
  FileDiff,
  Forge,
  PullRequestCheck,
} from "@humanity/contracts"

/** How each host names what this panel opens. */
export const forgeTerms = (forge: Forge) =>
  forge === "github"
    ? { noun: "pull request", site: "GitHub", symbol: "#" }
    : { noun: "merge request", site: "GitLab", symbol: "!" }

/**
 * The paths a commit of `files` names, each once: a rename takes its old path
 * along, so it isn't left as a deletion. A path can be listed twice, staged
 * as deleted and back on disk untracked; git commits both parts together.
 */
export const commitPaths = (files: ReadonlyArray<FileDiff>): Array<string> => [
  ...new Set(
    files.flatMap((file) =>
      file.previousPath === undefined ? [file.filePath] : [file.previousPath, file.filePath],
    ),
  ),
]

/**
 * Branches a pull request from `current` can merge into: local ones and those
 * only on `origin`, each once, without `current` itself. `preferred` (the
 * project's default branch) comes first.
 */
export const baseBranches = (
  branches: ReadonlyArray<Branch>,
  current: string | null,
  preferred: string,
): Array<string> => {
  const names = new Set<string>()
  for (const branch of branches) {
    if (branch.isRemote) {
      if (!branch.name.startsWith("origin/")) continue
      const name = branch.name.slice("origin/".length)
      if (name !== "HEAD" && name !== "") names.add(name)
    } else {
      names.add(branch.name)
    }
  }
  names.add(preferred)
  if (current !== null) names.delete(current)
  return [...names].sort((a, b) =>
    a === preferred ? -1 : b === preferred ? 1 : a.localeCompare(b),
  )
}

const commits = (count: number) => `${count} commit${count === 1 ? "" : "s"}`

/** Whether the branch has commits its remote lacks, or isn't on the remote at all. */
export const needsPush = (publication: BranchPublication): boolean =>
  publication.branch !== null && (publication.upstream === null || publication.ahead > 0)

/** One line on where the branch stands against its remote. */
export const remoteStatus = (publication: BranchPublication): string => {
  if (publication.branch === null) return "No branch is checked out (detached HEAD)."
  if (publication.upstream === null) return `${publication.branch} is not on the remote yet.`
  const parts: Array<string> = []
  if (publication.ahead > 0) parts.push(`${commits(publication.ahead)} to push`)
  if (publication.behind > 0) parts.push(`${commits(publication.behind)} behind`)
  return parts.length === 0
    ? `Up to date with ${publication.upstream}.`
    : `${parts.join(", ")} (${publication.upstream}).`
}

export interface CheckSummary {
  readonly passed: number
  readonly failed: number
  readonly pending: number
  readonly other: number
  /** The one word for all of them: what a badge shows. */
  readonly overall: "none" | "failure" | "pending" | "success"
}

/** Totals of a pull request's checks. Any failure fails it; else anything unfinished keeps it pending. */
export const summarizeChecks = (checks: ReadonlyArray<PullRequestCheck>): CheckSummary => {
  let passed = 0
  let failed = 0
  let pending = 0
  let other = 0
  for (const check of checks) {
    if (check.status === "success") passed++
    else if (check.status === "failure") failed++
    else if (check.status === "queued" || check.status === "running") pending++
    else other++
  }
  const overall =
    checks.length === 0 ? "none" : failed > 0 ? "failure" : pending > 0 ? "pending" : "success"
  return { passed, failed, pending, other, overall }
}
