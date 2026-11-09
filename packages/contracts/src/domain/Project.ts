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
