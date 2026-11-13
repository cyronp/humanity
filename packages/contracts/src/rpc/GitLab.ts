import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  GitLabBranch,
  GitLabConnection,
  GitLabFullPath,
  GitLabHost,
  GitLabRepo,
  GitLabTokenInput,
} from "../domain/GitLab.ts"
import { GitLabNotAuthenticated, GitLabRateLimited, GitLabRequestFailed } from "../Errors.ts"

const GitLabFailure = Schema.Union([GitLabNotAuthenticated, GitLabRateLimited, GitLabRequestFailed])

export const GitLabRpcs = RpcGroup.make(
  /**
   * Which GitLab instance is used, where its token comes from and who it signs
   * in as. Never fails: a token GitLab does not accept is reported as a
   * `problem`. The token lookup is cached briefly; `refresh: true` looks again
   * right away.
   */
  Rpc.make("GitLab.connection", {
    payload: { refresh: Schema.Boolean },
    success: GitLabConnection,
  }),
  /**
   * Saves a token and the instance it belongs to in Humanity's data folder,
   * after that instance accepted it. It is then used before the GitLab CLI's
   * login. A token GitLab rejects is not saved.
   */
  Rpc.make("GitLab.setToken", {
    payload: { token: GitLabTokenInput, host: GitLabHost },
    success: GitLabConnection,
    error: GitLabFailure,
  }),
  /** Forgets the saved token and its instance; the GitLab CLI or `GITLAB_TOKEN` is used again. */
  Rpc.make("GitLab.removeToken", {
    success: GitLabConnection,
  }),
  /** Repositories the authenticated user is a member of, most recently active first. */
  Rpc.make("GitLab.listRepos", {
    success: Schema.Array(GitLabRepo),
    error: GitLabFailure,
  }),
  Rpc.make("GitLab.listBranches", {
    payload: { fullPath: GitLabFullPath },
    success: Schema.Array(GitLabBranch),
    error: GitLabFailure,
  }),
)
