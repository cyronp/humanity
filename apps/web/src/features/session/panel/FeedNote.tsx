import type { Forge, PullRequestFeed } from "@humanity/contracts"
import { Info } from "lucide-react"
import { ErrorNote } from "@/components/ErrorNote"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { feedNotice } from "./publication.ts"

/** Says why the forge isn't being asked as usual, above whatever it last said. */
export function FeedNote({
  feed,
  forge,
}: {
  readonly feed: PullRequestFeed
  readonly forge: Forge
}) {
  const notice = feedNotice(feed, forge)
  if (notice === null) return null
  if (notice.tone === "error") return <ErrorNote title={notice.title} message={notice.message} />
  return (
    <Alert role="status">
      <Info />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.message}</AlertDescription>
    </Alert>
  )
}
