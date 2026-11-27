import { useAtomValue } from "@effect/atom-react"
import type { SessionId } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { feedKey, pullRequestFeedAtom } from "../atoms.ts"

export const usePullRequestFeed = (sessionId: SessionId, branch: string | null) =>
  useAtomValue(pullRequestFeedAtom(feedKey(sessionId, branch)))

export const usePullRequest = (sessionId: SessionId, branch: string | null) => {
  const feed = usePullRequestFeed(sessionId, branch)
  return AsyncResult.isSuccess(feed) ? feed.value.pullRequest : null
}
