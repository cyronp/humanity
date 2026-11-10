import { Schema } from "effect"
import { ToolPolicy } from "./Policy.ts"

export const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const Project = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  /** Absolute path of the user's repository. The agent never works inside it. */
  localPath: Schema.String,
  githubFullName: Schema.NullOr(Schema.String),
  defaultBranch: Schema.String,
  policy: ToolPolicy,
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
