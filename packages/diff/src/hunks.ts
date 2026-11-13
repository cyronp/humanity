import { structuredPatch } from "diff"
import type { ChangeKind, DiffHunk, Hunk } from "./types.ts"

export const DEFAULT_CONTEXT_LINES = 3

/**
 * Splits the change from `original` to `proposed` into hunks.
 * Returns an empty array when the two are identical.
 */
export const computeHunks = (
  original: string,
  proposed: string,
  options: { readonly context?: number; readonly idPrefix?: string } = {},
): Array<Hunk> => {
  const patch = structuredPatch("a", "b", original, proposed, undefined, undefined, {
    context: options.context ?? DEFAULT_CONTEXT_LINES,
  })
  const prefix = options.idPrefix ?? "hunk"
  return patch.hunks.map((hunk, position) => ({
    id: `${prefix}-${position + 1}`,
    index: position + 1,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines,
    status: "pending" as const,
  }))
}

/** A file that does not exist yet is created; anything else is modified. */
export const changeKind = (fileExists: boolean): ChangeKind => (fileExists ? "modify" : "create")

/**
 * `@@ -1,4 +1,6 @@`, the header a unified diff prints above a hunk. jsdiff keeps
 * an empty range one line later than the printed form (`-0,0`), so shift it back.
 */
export const hunkHeader = (hunk: DiffHunk): string => {
  const oldStart = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart
  const newStart = hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart
  return `@@ -${oldStart},${hunk.oldLines} +${newStart},${hunk.newLines} @@`
}
