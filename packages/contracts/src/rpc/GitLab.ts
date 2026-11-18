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
  Rpc.make("GitLab.connection", {
    payload: { refresh: Schema.Boolean },
    success: GitLabConnection,
  }),
  Rpc.make("GitLab.setToken", {
    payload: { token: GitLabTokenInput, host: GitLabHost },
    success: GitLabConnection,
    error: GitLabFailure,
  }),
  Rpc.make("GitLab.removeToken", {
    success: GitLabConnection,
  }),
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
