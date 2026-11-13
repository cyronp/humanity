import { Schema } from "effect"
import { Autonomy } from "./Policy.ts"

export const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const Project = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  /** Absolute path of the user's repository. The agent never works inside it. */
  localPath: Schema.String,
  githubFullName: Schema.NullOr(Schema.String),
  /** The GitLab repository its `origin` points at: the instance and `group/name`. */
  gitlab: Schema.NullOr(Schema.Struct({ host: Schema.String, fullPath: Schema.String })),
  defaultBranch: Schema.String,
  /**
   * The autonomy this project's new threads start with, or `null` to follow
   * the human's default for every project.
   */
  defaultAutonomy: Schema.NullOr(Autonomy),
  createdAt: Schema.String,
})
export type Project = typeof Project.Type

/** A project's favicon, found in its repository and sent inline. */
export const ProjectIcon = Schema.Struct({
  /** `image/svg+xml`, `image/png`, `image/x-icon`, ... */
  mimeType: Schema.String,
  /** The file's bytes, base64-encoded. */
  base64: Schema.String,
})
export type ProjectIcon = typeof ProjectIcon.Type
