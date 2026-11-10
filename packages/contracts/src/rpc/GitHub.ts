import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { GitHubBranch, GitHubFullName, GitHubRepo, GitHubUser } from "../domain/GitHub.ts"
import { GitHubNotAuthenticated, GitHubRateLimited, GitHubRequestFailed } from "../Errors.ts"

const GitHubFailure = Schema.Union([GitHubNotAuthenticated, GitHubRateLimited, GitHubRequestFailed])

export const GitHubRpcs = RpcGroup.make(
  Rpc.make("GitHub.whoami", {
    success: GitHubUser,
    error: GitHubFailure,
  }),
  /** Repositories the authenticated user owns, collaborates on or can see through an organization. */
  Rpc.make("GitHub.listRepos", {
    success: Schema.Array(GitHubRepo),
    error: GitHubFailure,
  }),
  Rpc.make("GitHub.listBranches", {
    payload: { fullName: GitHubFullName },
    success: Schema.Array(GitHubBranch),
    error: GitHubFailure,
  }),
)
