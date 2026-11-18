import { Schema } from "effect"
import { Autonomy } from "./Policy.ts"

export const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const Project = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  localPath: Schema.String,
  githubFullName: Schema.NullOr(Schema.String),
  gitlab: Schema.NullOr(Schema.Struct({ host: Schema.String, fullPath: Schema.String })),
  defaultBranch: Schema.String,
  defaultAutonomy: Schema.NullOr(Autonomy),
  createdAt: Schema.String,
})
export type Project = typeof Project.Type

export const FolderEntry = Schema.Struct({
  name: Schema.String,
  isRepository: Schema.Boolean,
})
export type FolderEntry = typeof FolderEntry.Type

export const ProjectIcon = Schema.Struct({
  mimeType: Schema.String,
  base64: Schema.String,
})
export type ProjectIcon = typeof ProjectIcon.Type
