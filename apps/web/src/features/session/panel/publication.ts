import type {
  Branch,
  BranchPublication,
  FileDiff,
  Forge,
  PullRequestCheck,
  PullRequestFeed,
} from "@humanity/contracts"

export const forgeTerms = (forge: Forge) =>
  forge === "github"
    ? { noun: "pull request", site: "GitHub", symbol: "#" }
    : { noun: "merge request", site: "GitLab", symbol: "!" }

export const commitPaths = (files: ReadonlyArray<FileDiff>): Array<string> => [
  ...new Set(
    files.flatMap((file) =>
      file.previousPath === undefined ? [file.filePath] : [file.previousPath, file.filePath],
    ),
  ),
]

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

export const checkoutMoved = (publication: BranchPublication): boolean =>
  publication.branch !== null && publication.checkedOut !== publication.branch

export const needsPush = (publication: BranchPublication): boolean =>
  publication.branch !== null && (publication.upstream === null || publication.ahead > 0)

export const remoteStatus = (publication: BranchPublication): string => {
  if (publication.branch === null)
    return "This thread started on a detached HEAD, so it has no branch."
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
  readonly overall: "none" | "failure" | "pending" | "success"
}

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

export interface FeedNotice {
  readonly tone: "error" | "note"
  readonly title: string
  readonly message: string
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export const feedNotice = (feed: PullRequestFeed, forge: Forge): FeedNotice | null => {
  const { site } = forgeTerms(forge)
  if (feed.pausedUntil !== null) {
    return {
      tone: "note",
      title: `Paused until ${clock(feed.pausedUntil)}`,
      message:
        feed.fetchedAt === null
          ? `${site}'s rate limit was reached.`
          : `${site}'s rate limit was reached. Showing what it said at ${clock(feed.fetchedAt)}.`,
    }
  }
  if (feed.problem !== null) {
    return { tone: "error", title: `Could not reach ${site}`, message: feed.problem }
  }
  if (feed.needsToken) {
    return {
      tone: "note",
      title: `No ${site} token connected`,
      message: `Updated only when you press Refresh. Connect a token in Settings → Repositories to keep it current.`,
    }
  }
  return null
}
