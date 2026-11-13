import { Schema } from "effect"

/** Where a project's pull requests live: GitHub pull requests or GitLab merge requests. */
export const Forge = Schema.Literals(["github", "gitlab"])
export type Forge = typeof Forge.Type

export const PullRequestState = Schema.Literals(["open", "draft", "merged", "closed"])
export type PullRequestState = typeof PullRequestState.Type

/** A GitHub pull request or a GitLab merge request, in the fields Humanity shows. */
export const PullRequest = Schema.Struct({
  forge: Forge,
  /** `#12` on GitHub, `!12` on GitLab. */
  number: Schema.Int,
  title: Schema.String,
  body: Schema.String,
  url: Schema.String,
  state: PullRequestState,
  /** The branch it merges into. */
  base: Schema.String,
  /** The branch it merges from. */
  head: Schema.String,
  /** The commit at the tip of `head`, which its checks run on. */
  headSha: Schema.String,
  author: Schema.String,
  createdAt: Schema.String,
})
export type PullRequest = typeof PullRequest.Type

/**
 * Where the session's branch stands against its remote: what the commit tab
 * needs to offer a push. Read from git alone, so asking costs the forge nothing.
 */
export const BranchPublication = Schema.Struct({
  /** `null` when the project's `origin` is on neither GitHub nor a known GitLab instance. */
  forge: Schema.NullOr(Forge),
  /** The checked-out branch; `null` on a detached HEAD. */
  branch: Schema.NullOr(Schema.String),
  /** The project's default branch, the usual base of a new pull request. */
  defaultBranch: Schema.String,
  /** The branch's upstream, such as `origin/feat/x`; `null` until it is pushed. */
  upstream: Schema.NullOr(Schema.String),
  /** Commits the branch has that its upstream lacks. */
  ahead: Schema.Int,
  /** Commits its upstream has that the branch lacks. */
  behind: Schema.Int,
  /** Files with uncommitted changes. */
  uncommitted: Schema.Int,
})
export type BranchPublication = typeof BranchPublication.Type

export const CheckStatus = Schema.Literals([
  "queued",
  "running",
  "success",
  "failure",
  "cancelled",
  "skipped",
  "neutral",
])
export type CheckStatus = typeof CheckStatus.Type

/** One CI result: a GitHub check run or commit status, or a GitLab pipeline job. */
export const PullRequestCheck = Schema.Struct({
  name: Schema.String,
  status: CheckStatus,
  /** A line from the CI about the result, when it gave one. */
  description: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  finishedAt: Schema.NullOr(Schema.String),
})
export type PullRequestCheck = typeof PullRequestCheck.Type

export const PullRequestCommentKind = Schema.Literals([
  /** On the conversation. */
  "comment",
  /** The summary of a review. */
  "review",
  /** On a line of the diff. */
  "inline",
])
export type PullRequestCommentKind = typeof PullRequestCommentKind.Type

export const PullRequestComment = Schema.Struct({
  id: Schema.String,
  kind: PullRequestCommentKind,
  author: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
  /** Markdown. */
  body: Schema.String,
  createdAt: Schema.String,
  url: Schema.NullOr(Schema.String),
  /** For an inline comment: the file and line it is on. */
  path: Schema.NullOr(Schema.String),
  line: Schema.NullOr(Schema.Int),
  /** For a review: approved, changes requested, ... */
  reviewState: Schema.NullOr(Schema.String),
})
export type PullRequestComment = typeof PullRequestComment.Type

/**
 * What the forge last said about a branch's pull request. The daemon asks the
 * forge once for everyone watching the branch and sends this again whenever
 * something in it changes.
 */
export const PullRequestFeed = Schema.Struct({
  /** The branch's open pull request, else its most recent one; `null` when it has none. */
  pullRequest: Schema.NullOr(PullRequest),
  checks: Schema.Array(PullRequestCheck),
  /** Oldest first. */
  comments: Schema.Array(PullRequestComment),
  /** When the forge last answered; `null` while it never has. */
  fetchedAt: Schema.NullOr(Schema.String),
  /** Why the forge could not be asked the last time; what is above is the last it said. */
  problem: Schema.NullOr(Schema.String),
  /** When asking resumes after a rate limit; `null` when nothing is on hold. */
  pausedUntil: Schema.NullOr(Schema.String),
  /** No token is connected: the forge is asked only when the human refreshes. */
  needsToken: Schema.Boolean,
})
export type PullRequestFeed = typeof PullRequestFeed.Type

export const NewPullRequest = Schema.Struct({
  title: Schema.NonEmptyString,
  body: Schema.String,
  /** The branch to merge into. */
  base: Schema.NonEmptyString,
  draft: Schema.Boolean,
})
export type NewPullRequest = typeof NewPullRequest.Type
