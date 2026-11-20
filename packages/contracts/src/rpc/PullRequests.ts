import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  BranchPublication,
  MergePullRequest,
  NewPullRequest,
  PullRequest,
  PullRequestFeed,
  SyncResult,
  SyncStatus,
} from "../domain/PullRequest.ts"
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
  Rpc.make("PullRequests.create", {
    payload: { sessionId: SessionId, pullRequest: NewPullRequest },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  /** Merges the thread's branch's open pull request, after posting the human's comment on it. */
  Rpc.make("PullRequests.merge", {
    payload: { sessionId: SessionId, merge: MergePullRequest },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  /** Closes the thread's branch's pull request, or reopens a closed one. */
  Rpc.make("PullRequests.setOpen", {
    payload: { sessionId: SessionId, open: Schema.Boolean },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  /** Converts the thread's branch's open pull request to a draft, or marks it ready for review. */
  Rpc.make("PullRequests.setDraft", {
    payload: { sessionId: SessionId, draft: Schema.Boolean },
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
  /** With `fetch`, fetches origin first unless that was done in the last minute. */
  Rpc.make("PullRequests.syncStatus", {
    payload: { sessionId: SessionId, fetch: Schema.Boolean },
    success: SyncStatus,
    error: Schema.Union(Base),
  }),
  /** Fetches, brings the branch up to date with its sync target, then pushes what is left. */
  Rpc.make("PullRequests.sync", {
    payload: { sessionId: SessionId },
    success: SyncResult,
    error: Schema.Union([...Base, SyncUnavailable]),
  }),
)
