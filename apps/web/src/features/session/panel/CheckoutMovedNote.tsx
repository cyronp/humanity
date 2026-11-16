import { useAtomValue } from "@effect/atom-react"
import type { BranchPublication, Session } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { feedKey, pullRequestFeedAtom } from "../atoms.ts"

/**
 * One line in place of the checkout's changes once it has moved off this
 * thread's branch: merged, when its pull request says so; else where it is now.
 */
export function CheckoutMovedNote({
  session,
  publication,
}: {
  readonly session: Session
  readonly publication: BranchPublication
}) {
  const feed = useAtomValue(pullRequestFeedAtom(feedKey(session.id, publication.branch)))
  const pullRequest = AsyncResult.isSuccess(feed) ? feed.value.pullRequest : null
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {pullRequest?.state === "merged" ? (
        <>
          This branch was merged into <code>{pullRequest.base}</code>.
        </>
      ) : (
        <>
          The checkout is on <code>{publication.checkedOut ?? "a detached HEAD"}</code> now; this
          thread&apos;s work is on <code>{publication.branch}</code>.
        </>
      )}
    </p>
  )
}
