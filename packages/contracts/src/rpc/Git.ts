import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Branch, RepoStatus, WorkingTreeDiff } from "../domain/Git.ts"
import { ProjectId } from "../domain/Project.ts"
import {
  GitBranchExists,
  GitCommandFailed,
  GitInvalidBranchName,
  GitNotARepository,
  GitNotInstalled,
  GitRefNotFound,
  ProjectNotFound,
} from "../Errors.ts"

const GitFailure = [ProjectNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed] as const

export const GitRpcs = RpcGroup.make(
  Rpc.make("Git.branches", {
    payload: { projectId: ProjectId },
    success: Schema.Array(Branch),
    error: Schema.Union(GitFailure),
  }),
  /** Creates a branch ref in the project's repository. Nothing is checked out. */
  Rpc.make("Git.createBranch", {
    payload: {
      projectId: ProjectId,
      name: Schema.String,
      /** Branch or commit to start from. Defaults to the project's default branch. */
      from: Schema.optional(Schema.String),
    },
    success: Branch,
    error: Schema.Union([...GitFailure, GitBranchExists, GitInvalidBranchName, GitRefNotFound]),
  }),
  Rpc.make("Git.status", {
    payload: { projectId: ProjectId },
    success: RepoStatus,
    error: Schema.Union(GitFailure),
  }),
  /** Uncommitted changes of the project's working copy, including untracked files. */
  Rpc.make("Git.diff", {
    payload: { projectId: ProjectId },
    success: WorkingTreeDiff,
    error: Schema.Union(GitFailure),
  }),
)
