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
  /** What the commit changed: files, and lines added and removed (0 for binary files). */
  files: Schema.Int,
  insertions: Schema.Int,
  deletions: Schema.Int,
  /** Whether the branch's upstream has it; only a pushed commit has a page on the forge. */
  pushed: Schema.Boolean,
  /** The commit's page on GitHub or GitLab, once it is pushed there. */
  url: Schema.NullOr(Schema.String),
  /** The author's picture on the forge, when the forge knows them. */
  avatarUrl: Schema.NullOr(Schema.String),
})
export type CommitSummary = typeof CommitSummary.Type

export const BranchCommits = Schema.Struct({
  branch: Schema.String,
  base: Schema.NullOr(Schema.String),
  commits: Schema.Array(CommitSummary),
  more: Schema.Boolean,
})
export type BranchCommits = typeof BranchCommits.Type

/** A file a branch changes against the branch it would merge into. */
export const ComparedFile = Schema.Struct({
  path: Schema.String,
  previousPath: Schema.NullOr(Schema.String),
  kind: Schema.Literals(["create", "modify", "delete", "rename"]),
  insertions: Schema.Int,
  deletions: Schema.Int,
  binary: Schema.Boolean,
})
export type ComparedFile = typeof ComparedFile.Type

/** What a pull request from the thread's branch into `base` would carry. */
export const BranchComparison = Schema.Struct({
  /** The ref compared against: `origin/<base>` when origin has it, else the local branch. */
  base: Schema.String,
  commits: Schema.Array(CommitSummary),
  more: Schema.Boolean,
  files: Schema.Array(ComparedFile),
})
export type BranchComparison = typeof BranchComparison.Type

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
