import { describe, expect, it } from "vitest"
import { reviewCommentsKey, toReviewPayload } from "@/features/session/panel/pullRequestReview"

describe("toReviewPayload", () => {
  it("sends each comment's anchor and text, leaving out empty ones", () => {
    expect(
      toReviewPayload("abc123", "  Close  ", [
        { id: "1", path: "a.ts", side: "new", line: 3, lineText: "x", body: " Why? " },
        { id: "2", path: "b.ts", side: "old", line: 9, lineText: "y", body: "   " },
      ]),
    ).toEqual({
      headSha: "abc123",
      body: "Close",
      comments: [{ path: "a.ts", side: "new", line: 3, body: "Why?" }],
    })
  })

  it("keeps a pull request's comments apart from the thread's own", () => {
    expect(reviewCommentsKey("s1", 7)).toBe("pr-s1-7")
  })
})
