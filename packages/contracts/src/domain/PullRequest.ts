import { Schema } from "effect"
import { FileDiff } from "./Diff.ts"

export const Forge = Schema.Literals(["github", "gitlab"])
export type Forge = typeof Forge.Type

export const PullRequestState = Schema.Literals(["open", "draft", "merged", "closed"])
export type PullRequestState = typeof PullRequestState.Type

export const PullRequest = Schema.Struct({
  forge: Forge,
  number: Schema.Int,
  title: Schema.String,
  body: Schema.String,
  url: Schema.String,
  state: PullRequestState,
  base: Schema.String,
  head: Schema.String,
  headSha: Schema.String,
  author: Schema.String,
  createdAt: Schema.String,
})
export type PullRequest = typeof PullRequest.Type

export const BranchPublication = Schema.Struct({
  forge: Schema.NullOr(Forge),
  branch: Schema.NullOr(Schema.String),
  checkedOut: Schema.NullOr(Schema.String),
  defaultBranch: Schema.String,
  upstream: Schema.NullOr(Schema.String),
  ahead: Schema.Int,
  behind: Schema.Int,
  uncommitted: Schema.Int,
})
export type BranchPublication = typeof BranchPublication.Type

export const SyncStatus = Schema.Struct({
  branch: Schema.NullOr(Schema.String),
  hasRemote: Schema.Boolean,
  target: Schema.NullOr(Schema.String),
  pushes: Schema.Boolean,
  behind: Schema.Int,
  ahead: Schema.Int,
  fetchedAt: Schema.NullOr(Schema.String),
  fetchError: Schema.NullOr(Schema.String),
})
export type SyncStatus = typeof SyncStatus.Type

export const SyncResult = Schema.Struct({
  status: SyncStatus,
  pulled: Schema.Int,
  pushed: Schema.Int,
  files: Schema.Array(Schema.String),
})
export type SyncResult = typeof SyncResult.Type

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

export const PullRequestCheck = Schema.Struct({
  name: Schema.String,
  status: CheckStatus,
  description: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  finishedAt: Schema.NullOr(Schema.String),
})
export type PullRequestCheck = typeof PullRequestCheck.Type

export const PullRequestCommentKind = Schema.Literals(["comment", "review", "inline"])
export type PullRequestCommentKind = typeof PullRequestCommentKind.Type

export const PullRequestComment = Schema.Struct({
  id: Schema.String,
  kind: PullRequestCommentKind,
  author: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
  body: Schema.String,
  createdAt: Schema.String,
  url: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
  line: Schema.NullOr(Schema.Int),
  reviewState: Schema.NullOr(Schema.String),
})
export type PullRequestComment = typeof PullRequestComment.Type

export const PullRequestFeed = Schema.Struct({
  pullRequest: Schema.NullOr(PullRequest),
  checks: Schema.Array(PullRequestCheck),
  comments: Schema.Array(PullRequestComment),
  fetchedAt: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
  pausedUntil: Schema.NullOr(Schema.String),
  needsToken: Schema.Boolean,
})
export type PullRequestFeed = typeof PullRequestFeed.Type

export const NewPullRequest = Schema.Struct({
  title: Schema.NonEmptyString,
  body: Schema.String,
  base: Schema.NonEmptyString,
  draft: Schema.Boolean,
})
export type NewPullRequest = typeof NewPullRequest.Type

export const PullRequestReviewComment = Schema.Struct({
  path: Schema.String,
  side: Schema.Literals(["new", "old"]),
  line: Schema.Int,
  body: Schema.NonEmptyString,
})
export type PullRequestReviewComment = typeof PullRequestReviewComment.Type

export const PullRequestReview = Schema.Struct({
  headSha: Schema.String,
  body: Schema.String,
  comments: Schema.Array(PullRequestReviewComment),
})
export type PullRequestReview = typeof PullRequestReview.Type

export const PullRequestFiles = Schema.Struct({
  number: Schema.Int,
  base: Schema.String,
  headSha: Schema.String,
  files: Schema.Array(FileDiff),
})
export type PullRequestFiles = typeof PullRequestFiles.Type

export const MergeMethod = Schema.Literals(["squash", "merge", "rebase"])
export type MergeMethod = typeof MergeMethod.Type

export const MergePullRequest = Schema.Struct({
  method: MergeMethod,
  comment: Schema.String,
  headSha: Schema.String,
})
export type MergePullRequest = typeof MergePullRequest.Type
