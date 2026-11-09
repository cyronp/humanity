import { Schema } from "effect"
import { FileDiff } from "./Diff.ts"

export const Branch = Schema.Struct({
  /** Short name: `main`, or `origin/main` for a remote-tracking branch. */
  name: Schema.String,
  isCurrent: Schema.Boolean,
  isRemote: Schema.Boolean,
  upstream: Schema.NullOr(Schema.String),
  commit: Schema.String,
  subject: Schema.String,
})
export type Branch = typeof Branch.Type

export const StatusEntryKind = Schema.Literals([
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "conflicted",
  "type_changed",
])
export type StatusEntryKind = typeof StatusEntryKind.Type

export const StatusEntry = Schema.Struct({
  path: Schema.String,
  previousPath: Schema.optional(Schema.String),
  kind: StatusEntryKind,
  /** True when the change (or part of it) is in the index. */
  staged: Schema.Boolean,
  /** True when the working tree differs from the index. */
  unstaged: Schema.Boolean,
})
export type StatusEntry = typeof StatusEntry.Type

export const RepoStatus = Schema.Struct({
  /** `null` on a detached HEAD. */
  branch: Schema.NullOr(Schema.String),
  upstream: Schema.NullOr(Schema.String),
  ahead: Schema.Int,
  behind: Schema.Int,
  entries: Schema.Array(StatusEntry),
})
export type RepoStatus = typeof RepoStatus.Type

export const WorkingTreeDiff = Schema.Struct({
  /** What the working tree is compared against, e.g. `HEAD` or a base branch. */
  base: Schema.String,
  files: Schema.Array(FileDiff),
})
export type WorkingTreeDiff = typeof WorkingTreeDiff.Type
