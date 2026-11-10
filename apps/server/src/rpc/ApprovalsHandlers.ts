import { ApprovalsRpcs, isPendingApproval } from "@humanity/contracts"
import { Effect } from "effect"
import { ApprovalService } from "../services/ApprovalService.ts"
import { SessionService } from "../services/SessionService.ts"

export const ApprovalsHandlers = ApprovalsRpcs.toLayer(
  Effect.gen(function* () {
    const approvals = yield* ApprovalService
    const sessions = yield* SessionService
    return ApprovalsRpcs.of({
      "Approvals.listPending": ({ sessionId }) =>
        Effect.andThen(sessions.get(sessionId), () =>
          Effect.map(approvals.listForSession(sessionId), (all) => all.filter(isPendingApproval)),
        ),
      "Approvals.decideChange": ({ changeId, decisions }) =>
        approvals.decideChange(changeId, decisions),
      "Approvals.decideConfirmation": ({ confirmationId, decision, comment, alwaysAllow }) =>
        approvals
          .decideConfirmation(confirmationId, { decision, comment, alwaysAllow })
          // The confirmation belongs to an existing project; a missing one is a bug, not a user error.
          .pipe(Effect.catchTag("ProjectNotFound", Effect.die)),
    })
  }),
)
