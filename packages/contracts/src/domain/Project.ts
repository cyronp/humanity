import { Effect, Schema } from "effect"
import { Autonomy } from "./Policy.ts"
import { ModelDefault } from "./Provider.ts"
import { MergeMethod } from "./PullRequest.ts"

export const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const WorktreeOnEnd = Schema.Literals(["ask", "keep", "remove"])
export type WorktreeOnEnd = typeof WorktreeOnEnd.Type

export const DEFAULT_BRANCH_PREFIX = "humanity/"

export const MAX_SETUP_SCRIPT_LENGTH = 4_000

export const isBranchPrefix = (prefix: string): boolean =>
  prefix === "" ||
  (/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(prefix) &&
    !prefix.includes("..") &&
    !prefix.includes("//") &&
    !/\.lock(\/|$)/.test(prefix) &&
    !/(^|\/)\./.test(prefix) &&
    prefix.length <= 40)

export const BranchPrefix = Schema.String.check(Schema.makeFilter(isBranchPrefix))

export const ProjectSettings = Schema.Struct({
  defaultModel: Schema.NullOr(ModelDefault),
  worktreeForNewThreads: Schema.Boolean,
  setupScript: Schema.NullOr(Schema.String.check(Schema.isMaxLength(MAX_SETUP_SCRIPT_LENGTH))),
  checkScript: Schema.NullOr(Schema.String.check(Schema.isMaxLength(MAX_SETUP_SCRIPT_LENGTH))),
  branchPrefix: BranchPrefix,
  mergeMethod: Schema.NullOr(MergeMethod),
  draftPullRequests: Schema.Boolean,
  worktreeOnEnd: WorktreeOnEnd,
})
export type ProjectSettings = typeof ProjectSettings.Type

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultModel: null,
  worktreeForNewThreads: false,
  setupScript: null,
  checkScript: null,
  branchPrefix: DEFAULT_BRANCH_PREFIX,
  mergeMethod: null,
  draftPullRequests: false,
  worktreeOnEnd: "ask",
}

export const StoredProjectSettings = Schema.Struct({
  defaultModel: Schema.NullOr(ModelDefault).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  worktreeForNewThreads: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  setupScript: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  checkScript: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  branchPrefix: BranchPrefix.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_BRANCH_PREFIX)),
  ),
  mergeMethod: Schema.NullOr(MergeMethod).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  draftPullRequests: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  worktreeOnEnd: WorktreeOnEnd.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<WorktreeOnEnd>("ask")),
  ),
})

export const MAX_PROJECT_NAME_LENGTH = 80

export const Project = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  localPath: Schema.String,
  githubFullName: Schema.NullOr(Schema.String),
  gitlab: Schema.NullOr(Schema.Struct({ host: Schema.String, fullPath: Schema.String })),
  defaultBranch: Schema.String,
  defaultAutonomy: Schema.NullOr(Autonomy),
  settings: ProjectSettings,
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
