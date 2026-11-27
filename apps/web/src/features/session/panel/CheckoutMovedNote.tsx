import type { BranchPublication, Session } from "@humanity/contracts"
import { PanelEmpty } from "@/components/PanelEmpty"
import { usePullRequest } from "./usePullRequestFeed.ts"

export function CheckoutMovedNote({
  session,
  publication,
}: {
  readonly session: Session
  readonly publication: BranchPublication
}) {
  const pullRequest = usePullRequest(session.id, publication.branch)
  return (
    <PanelEmpty>
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
    </PanelEmpty>
  )
}
