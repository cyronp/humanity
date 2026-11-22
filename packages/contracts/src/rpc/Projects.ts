import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { CloneEvent, GitHubFullName } from "../domain/GitHub.ts"
import { GitLabFullPath } from "../domain/GitLab.ts"
import { Autonomy } from "../domain/Policy.ts"
import {
  FolderEntry,
  MAX_PROJECT_NAME_LENGTH,
  Project,
  ProjectIcon,
  ProjectId,
  ProjectSettings,
} from "../domain/Project.ts"
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
  Rpc.make("Projects.listFolders", {
    payload: { folder: Schema.String, prefix: Schema.String },
    success: Schema.Array(FolderEntry),
  }),
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
  Rpc.make("Projects.icon", {
    payload: { projectId: ProjectId },
    success: Schema.NullOr(ProjectIcon),
    error: ProjectNotFound,
  }),
  Rpc.make("Projects.setDefaultAutonomy", {
    payload: { projectId: ProjectId, autonomy: Schema.NullOr(Autonomy) },
    success: Project,
    error: ProjectNotFound,
  }),
  Rpc.make("Projects.rename", {
    payload: {
      projectId: ProjectId,
      name: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_PROJECT_NAME_LENGTH)),
    },
    success: Project,
    error: ProjectNotFound,
  }),
  Rpc.make("Projects.setSettings", {
    payload: { projectId: ProjectId, settings: ProjectSettings },
    success: Project,
    error: ProjectNotFound,
  }),
)
