import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ToolPolicy } from "../domain/Policy.ts"
import { Project, ProjectId } from "../domain/Project.ts"
import {
  GitCommandFailed,
  GitNotARepository,
  GitNotInstalled,
  PathNotFound,
  ProjectAlreadyExists,
  ProjectNotFound,
} from "../Errors.ts"

export const ProjectsRpcs = RpcGroup.make(
  Rpc.make("Projects.list", {
    success: Schema.Array(Project),
  }),
  Rpc.make("Projects.addLocal", {
    payload: { path: Schema.String },
    success: Project,
    error: Schema.Union([
      PathNotFound,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
      ProjectAlreadyExists,
    ]),
  }),
  Rpc.make("Projects.remove", {
    payload: { projectId: ProjectId },
    error: ProjectNotFound,
  }),
  Rpc.make("Projects.getPolicy", {
    payload: { projectId: ProjectId },
    success: ToolPolicy,
    error: ProjectNotFound,
  }),
  /** Takes effect immediately, including for agents that are already running. */
  Rpc.make("Projects.setPolicy", {
    payload: { projectId: ProjectId, policy: ToolPolicy },
    success: ToolPolicy,
    error: ProjectNotFound,
  }),
)
