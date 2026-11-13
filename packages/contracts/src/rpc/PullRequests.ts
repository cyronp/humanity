import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  BranchPublication,
  NewPullRequest,
  PullRequest,
  PullRequestDetails,
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
  /**
   * The branch against its remote and its pull request. A forge that can't be
   * asked is reported as `problem`, so the push side still works.
   */
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
  /** The branch's pull request with its checks and comments; `null` when it has none. */
  Rpc.make("PullRequests.details", {
    payload: { sessionId: SessionId },
    success: Schema.NullOr(PullRequestDetails),
    error: Schema.Union([...Base, ...Forge]),
  }),
)
