import type { FileDiff, PullRequestReviewComment } from "@humanity/contracts"
import { toDiffLines } from "@humanity/diff"

export interface PlacedComment {
  readonly path: string
  readonly previousPath: string
  readonly side: "new" | "old"
  readonly line: number
  readonly oldLine: number | undefined
  readonly newLine: number | undefined
  readonly body: string
}

export interface Placement {
  readonly placed: ReadonlyArray<PlacedComment>
  readonly missing: ReadonlyArray<PullRequestReviewComment>
}

export const placeReviewComments = (
  files: ReadonlyArray<FileDiff>,
  comments: ReadonlyArray<PullRequestReviewComment>,
): Placement => {
  const placed: Array<PlacedComment> = []
  const missing: Array<PullRequestReviewComment> = []
  for (const comment of comments) {
    const file = files.find((each) => each.filePath === comment.path)
    const row = file?.hunks
      .flatMap(toDiffLines)
      .find((each) =>
        each.kind === "meta"
          ? false
          : comment.side === "old"
            ? each.kind === "remove" && each.oldNumber === comment.line
            : each.kind !== "remove" && each.newNumber === comment.line,
      )
    if (file === undefined || row === undefined) {
      missing.push(comment)
      continue
    }
    placed.push({
      path: file.filePath,
      previousPath: file.previousPath ?? file.filePath,
      side: comment.side,
      line: comment.line,
      oldLine: row.oldNumber,
      newLine: row.newNumber,
      body: comment.body.trim(),
    })
  }
  return { placed, missing }
}
