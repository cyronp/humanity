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
  /**
   * Where the GitHub token comes from and who it signs in as. Never fails: a
   * token GitHub does not accept is reported as a `problem`. The token lookup
   * is cached briefly; `refresh: true` looks again right away.
   */
  Rpc.make("GitHub.connection", {
    payload: { refresh: Schema.Boolean },
    success: GitHubConnection,
  }),
  /**
   * Saves a token in Humanity's data folder, after GitHub accepted it. It is
   * then used before the GitHub CLI's login. A token GitHub rejects is not saved.
   */
  Rpc.make("GitHub.setToken", {
    payload: { token: GitHubTokenInput },
    success: GitHubConnection,
    error: GitHubFailure,
  }),
  /** Forgets the saved token; the GitHub CLI or `GITHUB_TOKEN` is used again. */
  Rpc.make("GitHub.removeToken", {
    success: GitHubConnection,
  }),
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
