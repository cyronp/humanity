import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Branch, FileEntry } from "../domain/Git.ts"
import { ProjectId } from "../domain/Project.ts"
import { GitCommandFailed, GitNotARepository, GitNotInstalled, ProjectNotFound } from "../Errors.ts"

const GitFailure = [ProjectNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed] as const

export const GitRpcs = RpcGroup.make(
  Rpc.make("Git.branches", {
    payload: { projectId: ProjectId },
    success: Schema.Array(Branch),
    error: Schema.Union(GitFailure),
  }),
  Rpc.make("Git.searchFiles", {
    payload: {
      projectId: ProjectId,
      query: Schema.String,
      recent: Schema.optional(Schema.Array(Schema.String)),
    },
    success: Schema.Array(FileEntry),
    error: Schema.Union(GitFailure),
  }),
)
