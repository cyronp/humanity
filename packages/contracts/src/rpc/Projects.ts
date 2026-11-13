import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { CloneEvent, GitHubFullName } from "../domain/GitHub.ts"
import { GitLabFullPath } from "../domain/GitLab.ts"
import { Autonomy } from "../domain/Policy.ts"
import { Project, ProjectIcon, ProjectId } from "../domain/Project.ts"
import {
  CloneTargetExists,
  GitCommandFailed,
  GitHubNotAuthenticated,
  GitHubRateLimited,
  GitHubRequestFailed,
  GitLabNotAuthenticated,
  GitLabRateLimited,
  GitLabRequestFailed,
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
  /** Clones into the data directory with live progress, then adds the clone as a project. */
  Rpc.make("Projects.cloneFromGitHub", {
    payload: { fullName: GitHubFullName },
    success: CloneEvent,
    error: Schema.Union([
      GitHubNotAuthenticated,
      GitHubRateLimited,
      GitHubRequestFailed,
      CloneTargetExists,
      ProjectAlreadyExists,
      PathNotFound,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
    ]),
    stream: true,
  }),
  /** The same for a repository of the connected GitLab instance. */
  Rpc.make("Projects.cloneFromGitLab", {
    payload: { fullPath: GitLabFullPath },
    success: CloneEvent,
    error: Schema.Union([
      GitLabNotAuthenticated,
      GitLabRateLimited,
      GitLabRequestFailed,
      CloneTargetExists,
      ProjectAlreadyExists,
      PathNotFound,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
    ]),
    stream: true,
  }),
  Rpc.make("Projects.remove", {
    payload: { projectId: ProjectId },
    error: ProjectNotFound,
  }),
  /** The project's favicon, looked up in its repository, or `null` when it has none. Read-only. */
  Rpc.make("Projects.icon", {
    payload: { projectId: ProjectId },
    success: Schema.NullOr(ProjectIcon),
    error: ProjectNotFound,
  }),
  /**
   * The autonomy the project's new threads start with; `null` follows the
   * human's default for every project. Threads that already exist keep theirs.
   */
  Rpc.make("Projects.setDefaultAutonomy", {
    payload: { projectId: ProjectId, autonomy: Schema.NullOr(Autonomy) },
    success: Project,
    error: ProjectNotFound,
  }),
)
