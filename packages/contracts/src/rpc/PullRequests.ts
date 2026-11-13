import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  BranchPublication,
  NewPullRequest,
  PullRequest,
  PullRequestFeed,
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

/**
 * Publishing a session's branch: pushing it, opening its pull request (a
 * merge request on GitLab) and following that pull request's checks and
 * comments. Everything acts where the session works, on the branch checked
 * out there.
 */
export const PullRequestsRpcs = RpcGroup.make(
  /** The branch against its remote, from git alone: the forge is not asked. */
  Rpc.make("PullRequests.publication", {
    payload: { sessionId: SessionId },
    success: BranchPublication,
    error: Schema.Union(Base),
  }),
  /** Pushes the branch to `origin` and makes it the upstream. Only between turns. */
  Rpc.make("PullRequests.push", {
    payload: { sessionId: SessionId },
    success: BranchPublication,
    error: Schema.Union([...Base, PullRequestUnavailable]),
  }),
  /** Pushes the branch if it needs it, then opens its pull request. Only between turns. */
  Rpc.make("PullRequests.create", {
    payload: { sessionId: SessionId, pullRequest: NewPullRequest },
    success: PullRequest,
    error: Schema.Union([...Base, ...Forge, PullRequestUnavailable]),
  }),
  /**
   * The branch's pull request with its checks and comments: what the daemon
   * knows right away, then again whenever the forge says something new. The
   * forge is asked while someone watches, once for everyone on the same branch.
   * A forge that can't be asked is reported in the feed, never as a failure.
   */
  Rpc.make("PullRequests.watch", {
    payload: { sessionId: SessionId },
    success: PullRequestFeed,
    error: Schema.Union(Base),
    stream: true,
  }),
  /** Asks the forge again now, for everyone watching the session's branch. */
  Rpc.make("PullRequests.refresh", {
    payload: { sessionId: SessionId },
    error: Schema.Union(Base),
  }),
)
