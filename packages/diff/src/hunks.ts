import { applyPatch, structuredPatch } from "diff"
import type { ChangeKind, DiffHunk, Hunk, HunkDecision, ReviewOutcome } from "./types.ts"

export const DEFAULT_CONTEXT_LINES = 3

/**
 * Splits the change from `original` to `proposed` into reviewable hunks.
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
 * The lines a hunk contributes when applied. Today that is always the proposed
 * lines; post-MVP an edited hunk will substitute `editedLines` here, and
 * nothing else in the flow needs to change.
 */
const effectiveLines = (hunk: DiffHunk): Array<string> => [...hunk.lines]

export class HunkApplyError extends Error {
  override readonly name = "HunkApplyError"
  constructor(readonly indexes: ReadonlyArray<number>) {
    super(`Hunks ${indexes.join(", ")} no longer apply to the file content.`)
  }
}

/**
 * Applies only the hunks whose `index` is in `approved` to `original`, leaving
 * every other part of the file as it was. All hunks must have been computed
 * against `original`.
 *
 * @throws HunkApplyError if the selected hunks do not match `original`.
 */
export const applyHunks = (
  original: string,
  hunks: ReadonlyArray<DiffHunk>,
  approved: Iterable<number>,
): string => {
  const wanted = new Set(approved)
  const selected = hunks.filter((hunk) => wanted.has(hunk.index))
  if (selected.length === 0) return original

  const result = applyPatch(
    original,
    {
      oldFileName: "a",
      newFileName: "b",
      oldHeader: undefined,
      newHeader: undefined,
      hunks: selected.map((hunk) => ({
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines: effectiveLines(hunk),
      })),
    },
    // The hunks came from this exact content: no fuzz, no line-ending rewriting.
    { fuzzFactor: 0, autoConvertLineEndings: false },
  )
  if (result === false) throw new HunkApplyError(selected.map((hunk) => hunk.index))
  return result
}

/** Folds the human's decisions into the hunks. Undecided hunks stay `pending`. */
export const withDecisions = (
  hunks: ReadonlyArray<Hunk>,
  decisions: ReadonlyArray<HunkDecision>,
): Array<Hunk> => {
  const byIndex = new Map(decisions.map((decision) => [decision.index, decision]))
  return hunks.map((hunk) => {
    const decision = byIndex.get(hunk.index)
    if (decision === undefined) return hunk
    const comment = decision.comment?.trim()
    const { comment: _previous, ...rest } = hunk
    return {
      ...rest,
      status: decision.decision,
      ...(comment ? { comment } : {}),
    }
  })
}

export const approvedIndexes = (hunks: ReadonlyArray<Hunk>): Array<number> =>
  hunks.filter((hunk) => hunk.status === "approved").map((hunk) => hunk.index)

export const rejectedHunks = (hunks: ReadonlyArray<Hunk>): Array<Hunk> =>
  hunks.filter((hunk) => hunk.status === "rejected")

export const isFullyDecided = (hunks: ReadonlyArray<Hunk>): boolean =>
  hunks.every((hunk) => hunk.status !== "pending")

/**
 * What a fully decided review amounts to.
 *
 * @throws if any hunk is still pending; an undecided review has no outcome.
 */
export const reviewOutcome = (hunks: ReadonlyArray<Hunk>): ReviewOutcome => {
  if (!isFullyDecided(hunks)) throw new Error("Cannot settle a review with pending hunks.")
  const approved = approvedIndexes(hunks).length
  if (approved === hunks.length) return "applied"
  return approved === 0 ? "rejected" : "partially_applied"
}

/**
 * `@@ -1,4 +1,6 @@`, the header a unified diff prints above a hunk. jsdiff keeps
 * an empty range one line later than the printed form (`-0,0`), so shift it back.
 */
export const hunkHeader = (hunk: DiffHunk): string => {
  const oldStart = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart
  const newStart = hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart
  return `@@ -${oldStart},${hunk.oldLines} +${newStart},${hunk.newLines} @@`
}
