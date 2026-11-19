import { Schema } from "effect"

export const HunkStatus = Schema.Literals(["pending", "approved", "rejected"])
export type HunkStatus = typeof HunkStatus.Type

const hunkRange = {
  index: Schema.Int,
  oldStart: Schema.Int,
  oldLines: Schema.Int,
  newStart: Schema.Int,
  newLines: Schema.Int,
  lines: Schema.Array(Schema.String),
}

export const DiffHunk = Schema.Struct(hunkRange)
export type DiffHunk = typeof DiffHunk.Type

export const Hunk = Schema.Struct({
  id: Schema.String,
  ...hunkRange,
  status: HunkStatus,
  comment: Schema.optionalKey(Schema.String),
})
export type Hunk = typeof Hunk.Type

export const FileDiff = Schema.Struct({
  filePath: Schema.String,
  previousPath: Schema.optional(Schema.String),
  kind: Schema.Literals(["create", "modify", "delete", "rename"]),
  binary: Schema.Boolean,
  hunks: Schema.Array(DiffHunk),
})
export type FileDiff = typeof FileDiff.Type
