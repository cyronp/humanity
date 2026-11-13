import { PullRequestsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { PullRequestService } from "../services/PullRequestService.ts"

export const PullRequestsHandlers = PullRequestsRpcs.toLayer(
  Effect.gen(function* () {
    const pullRequests = yield* PullRequestService
    return PullRequestsRpcs.of({
      "PullRequests.publication": ({ sessionId }) => pullRequests.publication(sessionId),
      "PullRequests.push": ({ sessionId }) => pullRequests.push(sessionId),
      "PullRequests.create": ({ sessionId, pullRequest }) =>
        pullRequests.create(sessionId, pullRequest),
      "PullRequests.details": ({ sessionId }) => pullRequests.details(sessionId),
    })
  }),
)
