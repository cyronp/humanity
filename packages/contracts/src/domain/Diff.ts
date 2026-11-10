import { Schema } from "effect"

/**
 * These schemas mirror the plain types of `@humanity/diff`, which stays free
 * of framework dependencies. `packages/contracts/test/Diff.test.ts` keeps the
 * two in sync at the type level.
 */

export const HunkStatus = Schema.Literals(["pending", "approved", "rejected"])
export type HunkStatus = typeof HunkStatus.Type

const hunkRange = {
  /** 1-based, shown to the human and used in messages to the agent. */
  index: Schema.Int,
  oldStart: Schema.Int,
  oldLines: Schema.Int,
  newStart: Schema.Int,
  newLines: Schema.Int,
  /** Unified diff lines with their `+`, `-` or space prefix. */
  lines: Schema.Array(Schema.String),
}

export const DiffHunk = Schema.Struct(hunkRange)
export type DiffHunk = typeof DiffHunk.Type

export const Hunk = Schema.Struct({
  id: Schema.String,
  ...hunkRange,
  status: HunkStatus,
  comment: Schema.optionalKey(Schema.String),
  // post-MVP: editedLines: Schema.optional(Schema.Array(Schema.String))
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
