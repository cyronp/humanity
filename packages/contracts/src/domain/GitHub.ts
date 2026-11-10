import { Schema } from "effect"
import { Project } from "./Project.ts"

export const GitHubUser = Schema.Struct({
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.String,
})
export type GitHubUser = typeof GitHubUser.Type

export const GitHubRepo = Schema.Struct({
  /** `owner/name` */
  fullName: Schema.String,
  name: Schema.String,
  owner: Schema.String,
  description: Schema.NullOr(Schema.String),
  private: Schema.Boolean,
  defaultBranch: Schema.String,
  cloneUrl: Schema.String,
  htmlUrl: Schema.String,
  updatedAt: Schema.String,
})
export type GitHubRepo = typeof GitHubRepo.Type

export const GitHubBranch = Schema.Struct({
  name: Schema.String,
  commitSha: Schema.String,
  protected: Schema.Boolean,
})
export type GitHubBranch = typeof GitHubBranch.Type

/** `owner/repo` as GitHub allows it. Anything else never reaches git or the file system. */
export const GitHubFullName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/),
)

/** Streamed by `Projects.cloneFromGitHub`. */
export const CloneEvent = Schema.Union([
  /** A line of git's progress output. */
  Schema.TaggedStruct("Progress", { line: Schema.String }),
  /** The clone finished and was added as a project. */
  Schema.TaggedStruct("Cloned", { project: Project }),
])
export type CloneEvent = typeof CloneEvent.Type
