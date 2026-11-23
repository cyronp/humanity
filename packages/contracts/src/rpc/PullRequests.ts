import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  BranchPublication,
  MergePullRequest,
  NewPullRequest,
  PullRequest,
  PullRequestFeed,
  PullRequestFiles,
  PullRequestReview,
  SyncResult,
  SyncStatus,
} from "../domain/PullRequest.ts"
import { BranchComparison } from "../domain/Git.ts"
import { SessionId } from "../domain/Session.ts"
import {
  GitCommandFailed,
  GitHubNotAuthenticated,
  GitHubRateLimited,
  GitHubRequestFailed,
  GitLabNotAuthenticated,
  GitLabRateLimited,
  GitLabRequestFailed,
  GitNotARepository,
  GitNotInstalled,
  GitRefNotFound,
  ProjectNotFound,
  PullRequestUnavailable,
  SessionNotFound,
  SyncUnavailable,
} from "../Errors.ts"

const Base = [
  SessionNotFound,
  ProjectNotFound,
  GitNotARepository,
  GitNotInstalled,
  GitCommandFailed,
]
const Forge = [
  GitHubNotAuthenticated,
  GitHubRateLimited,
  GitHubRequestFailed,
  GitLabNotAuthenticated,
  GitLabRateLimited,
  GitLabRequestFailed,
]

export const PullRequestsRpcs = RpcGroup.make(
  Rpc.make("PullRequests.publication", {
    payload: { sessionId: SessionId },
    success: BranchPublication,
    error: Schema.Union(Base),
  }),
  Rpc.make("PullRequests.push", {
    payload: { sessionId: SessionId },
    success: BranchPublication,
    error: Schema.Union([...Base, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.compare", {
    payload: { sessionId: SessionId, base: Schema.String },
    success: BranchComparison,
    error: Schema.Union([...Base, GitRefNotFound, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.create", {
    payload: { sessionId: SessionId, pullRequest: NewPullRequest },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.merge", {
    payload: { sessionId: SessionId, merge: MergePullRequest },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.setOpen", {
    payload: { sessionId: SessionId, open: Schema.Boolean },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.setDraft", {
    payload: { sessionId: SessionId, draft: Schema.Boolean },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.files", {
    payload: { sessionId: SessionId },
    success: PullRequestFiles,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.review", {
    payload: { sessionId: SessionId, review: PullRequestReview },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  Rpc.make("PullRequests.watch", {
    payload: { sessionId: SessionId },
    success: PullRequestFeed,
    error: Schema.Union(Base),
    stream: true,
  }),
  Rpc.make("PullRequests.refresh", {
    payload: { sessionId: SessionId },
    error: Schema.Union(Base),
  }),
  Rpc.make("PullRequests.syncStatus", {
    payload: { sessionId: SessionId, fetch: Schema.Boolean },
    success: SyncStatus,
    error: Schema.Union(Base),
  }),
  Rpc.make("PullRequests.sync", {
    payload: { sessionId: SessionId },
    success: SyncResult,
    error: Schema.Union([...Base, SyncUnavailable]),
  }),
)
