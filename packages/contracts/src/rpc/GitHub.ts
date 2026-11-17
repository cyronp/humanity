import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  GitHubBranch,
  GitHubConnection,
  GitHubFullName,
  GitHubRepo,
  GitHubTokenInput,
  GitHubUser,
} from "../domain/GitHub.ts"
import { GitHubNotAuthenticated, GitHubRateLimited, GitHubRequestFailed } from "../Errors.ts"

const GitHubFailure = Schema.Union([GitHubNotAuthenticated, GitHubRateLimited, GitHubRequestFailed])

export const GitHubRpcs = RpcGroup.make(
  Rpc.make("GitHub.connection", {
    payload: { refresh: Schema.Boolean },
    success: GitHubConnection,
  }),
  Rpc.make("GitHub.setToken", {
    payload: { token: GitHubTokenInput },
    success: GitHubConnection,
    error: GitHubFailure,
  }),
  Rpc.make("GitHub.removeToken", {
    success: GitHubConnection,
  }),
  Rpc.make("GitHub.whoami", {
    success: GitHubUser,
    error: GitHubFailure,
  }),
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
