import {
  type Branch,
  type BranchPublication,
  type FileDiff,
  type Forge,
  forgeTerms,
  type MergeMethod,
  type PullRequestCheck,
  type PullRequestFeed,
  plural,
} from "@humanity/contracts"

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

const commits = (count: number) => plural(count, "commit")

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

export type PrimaryAction =
  | { readonly kind: "commit"; readonly files: number }
  | { readonly kind: "push" }
  | { readonly kind: "open-pull-request" }
  | { readonly kind: "ready" }
  | { readonly kind: "merge" }

export const primaryAction = ({
  publication,
  changed,
  feed,
}: {
  readonly publication: BranchPublication
  readonly changed: number
  readonly feed: PullRequestFeed | undefined
}): PrimaryAction | null => {
  if (checkoutMoved(publication)) return null
  if (changed > 0) return { kind: "commit", files: changed }
  if (publication.branch === null) return null
  const pullRequest = feed?.pullRequest ?? null
  const live =
    pullRequest !== null && (pullRequest.state === "open" || pullRequest.state === "draft")
  if (live) {
    if (needsPush(publication)) return { kind: "push" }
    return pullRequest.state === "draft" ? { kind: "ready" } : { kind: "merge" }
  }
  const canOpen =
    publication.forge !== null &&
    publication.branch !== publication.defaultBranch &&
    feed !== undefined &&
    feed.fetchedAt !== null &&
    pullRequest?.state !== "merged"
  if (canOpen) return { kind: "open-pull-request" }
  return needsPush(publication) ? { kind: "push" } : null
}

export const checksPhrase = (checks: ReadonlyArray<PullRequestCheck>): string => {
  if (checks.length === 0) return "No checks reported yet"
  const summary = summarizeChecks(checks)
  return [
    summary.failed > 0 && `${summary.failed} failing`,
    summary.pending > 0 && `${summary.pending} in progress`,
    summary.passed > 0 && `${summary.passed} passed`,
    summary.other > 0 && `${summary.other} skipped`,
  ]
    .filter((part) => part !== false)
    .join(" · ")
}

export interface FooterNote {
  readonly text: string
  readonly tone: "muted" | "destructive"
}

export const footerNote = ({
  action,
  publication,
  changed,
  feed,
}: {
  readonly action: PrimaryAction | null
  readonly publication: BranchPublication
  readonly changed: number
  readonly feed: PullRequestFeed | undefined
}): FooterNote | null => {
  if (checkoutMoved(publication)) return null
  const muted = (text: string): FooterNote => ({ text, tone: "muted" })
  const pullRequest = feed?.pullRequest ?? null
  const checks = feed?.checks ?? []
  switch (action?.kind) {
    case "commit": {
      const toPush =
        publication.upstream !== null && publication.ahead > 0
          ? ` · ${commits(publication.ahead)} to push`
          : ""
      return muted(`${plural(changed, "file")} changed${toPush}`)
    }
    case "push":
      return muted(remoteStatus(publication))
    case "open-pull-request":
      return publication.forge === null
        ? null
        : muted(`No ${forgeTerms(publication.forge).noun} for this branch yet.`)
    case "ready":
      return muted(`A draft · ${checksPhrase(checks)}`)
    case "merge": {
      const failing = checks.filter((check) => check.status === "failure")
      if (failing.length > 0) {
        return {
          text: `${plural(failing.length, "check")} failing: ${failing.map((check) => check.name).join(", ")}`,
          tone: "destructive",
        }
      }
      const summary = summarizeChecks(checks)
      return muted(
        summary.overall === "none"
          ? "No checks reported"
          : summary.overall === "pending"
            ? "Checks in progress"
            : "Every check passed",
      )
    }
    case undefined:
      return pullRequest?.state === "merged"
        ? muted(`Merged into ${pullRequest.base}`)
        : muted(remoteStatus(publication))
  }
}

export interface MergeOption {
  readonly method: MergeMethod
  readonly label: string
  readonly description: string
}

export const preferMergeMethod = (
  options: ReadonlyArray<MergeOption>,
  preferred: MergeMethod | null,
): ReadonlyArray<MergeOption> => {
  const first = options.find((option) => option.method === preferred)
  return first === undefined
    ? options
    : [first, ...options.filter((option) => option.method !== preferred)]
}

export const mergeOptions = (forge: Forge): ReadonlyArray<MergeOption> =>
  forge === "github"
    ? [
        { method: "squash", label: "Squash and merge", description: "Combine all commits" },
        { method: "merge", label: "Merge commit", description: "Preserve commit history" },
        { method: "rebase", label: "Rebase and merge", description: "Reapply all commits" },
      ]
    : [
        { method: "merge", label: "Merge", description: "By the project's merge method" },
        { method: "squash", label: "Squash and merge", description: "Combine all commits" },
      ]
