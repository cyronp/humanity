import { approvedIndexes, rejectedHunks } from "./hunks.ts"
import type { Hunk } from "./types.ts"

/** Comments go on one line, so the message keeps its fixed three-line shape. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

const quoteComment = (comment: string | undefined) => {
  const text = comment === undefined ? "" : oneLine(comment)
  return text === "" ? "(no comment)" : `— "${text}"`
}

const hunkList = (indexes: ReadonlyArray<number>) =>
  `${indexes.length === 1 ? "hunk" : "hunks"} ${indexes.join(", ")}`

const rejectionList = (hunks: ReadonlyArray<Hunk>) =>
  rejectedHunks(hunks)
    .map((hunk) => `hunk ${hunk.index} ${quoteComment(hunk.comment)}`)
    .join("; ")

/**
 * The `deny` message returned to the agent after a partial approval. This is
 * the only place that wording lives: the agent must never be able to conclude
 * that its whole change landed when only part of it did.
 *
 * ```
 * PARTIALLY APPLIED by the human reviewer to src/app.ts.
 * Applied: hunks 1, 3. Rejected: hunk 2 — "Keep the old validation, it's used by the CLI".
 * The file on disk now differs from what you proposed. Re-read it before making further edits.
 * ```
 */
export const formatPartialApplicationMessage = (
  filePath: string,
  hunks: ReadonlyArray<Hunk>,
): string => {
  const applied = approvedIndexes(hunks)
  if (applied.length === 0 || applied.length === hunks.length) {
    throw new Error("A partial application needs at least one applied and one rejected hunk.")
  }
  return [
    `PARTIALLY APPLIED by the human reviewer to ${filePath}.`,
    `Applied: ${hunkList(applied)}. Rejected: ${rejectionList(hunks)}.`,
    "The file on disk now differs from what you proposed. Re-read it before making further edits.",
  ].join("\n")
}

/** The `deny` message when the human rejected every hunk: nothing reached disk. */
export const formatRejectionMessage = (filePath: string, hunks: ReadonlyArray<Hunk>): string =>
  [
    `REJECTED by the human reviewer: no part of your change to ${filePath} was applied.`,
    `Rejected: ${rejectionList(hunks)}.`,
    "The file on disk is unchanged. Address the feedback before proposing another edit.",
  ].join("\n")
