import type { PullRequestReview } from "@humanity/contracts"
import type { ReviewComment } from "@/features/diff/reviewComments"

export const reviewCommentsKey = (sessionId: string, number: number) => `pr-${sessionId}-${number}`

export const toReviewPayload = (
  headSha: string,
  summary: string,
  comments: ReadonlyArray<ReviewComment>,
): PullRequestReview => ({
  headSha,
  body: summary.trim(),
  comments: comments
    .filter((comment) => comment.body.trim() !== "")
    .map((comment) => ({
      path: comment.path,
      side: comment.side,
      line: comment.line,
      body: comment.body.trim(),
    })),
})
