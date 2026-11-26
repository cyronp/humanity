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
      "Approvals.decideChange": ({ changeId, decision, comment, allowForSession }) =>
        approvals.decideChange(changeId, { decision, comment, allowForSession }),
      "Approvals.decideConfirmation": ({
        confirmationId,
        decision,
        comment,
        allowForSession,
        answers,
      }) =>
        approvals.decideConfirmation(confirmationId, {
          decision,
          comment,
          allowForSession,
          answers,
        }),
    })
  }),
)
