import { Schema } from "effect"
import { FileDiff } from "./Diff.ts"

export const Branch = Schema.Struct({
  name: Schema.String,
  isCurrent: Schema.Boolean,
  isRemote: Schema.Boolean,
  upstream: Schema.NullOr(Schema.String),
  commit: Schema.String,
  subject: Schema.String,
  author: Schema.String,
  committedAt: Schema.String,
  ahead: Schema.Number,
  behind: Schema.Number,
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
  staged: Schema.Boolean,
  unstaged: Schema.Boolean,
})
export type StatusEntry = typeof StatusEntry.Type

export const RepoStatus = Schema.Struct({
  branch: Schema.NullOr(Schema.String),
  upstream: Schema.NullOr(Schema.String),
  ahead: Schema.Int,
  behind: Schema.Int,
  entries: Schema.Array(StatusEntry),
})
export type RepoStatus = typeof RepoStatus.Type

export const CommitSummary = Schema.Struct({
  hash: Schema.String,
  shortHash: Schema.String,
  subject: Schema.String,
  author: Schema.String,
  committedAt: Schema.String,
})
export type CommitSummary = typeof CommitSummary.Type

export const BranchCommits = Schema.Struct({
  branch: Schema.String,
  base: Schema.NullOr(Schema.String),
  commits: Schema.Array(CommitSummary),
  more: Schema.Boolean,
})
export type BranchCommits = typeof BranchCommits.Type

export const WorkingTreeDiff = Schema.Struct({
  base: Schema.String,
  files: Schema.Array(FileDiff),
})
export type WorkingTreeDiff = typeof WorkingTreeDiff.Type

export const FileEntry = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literals(["file", "directory"]),
})
export type FileEntry = typeof FileEntry.Type
