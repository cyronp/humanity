import { type ApprovalRecord, ApprovalsRpcs, isPendingApproval } from "@humanity/contracts"
import { Effect } from "effect"
import { ApprovalService } from "../services/ApprovalService.ts"
import { SessionService } from "../services/SessionService.ts"

export const ApprovalsHandlers = ApprovalsRpcs.toLayer(
  Effect.gen(function* () {
    const approvals = yield* ApprovalService
    const sessions = yield* SessionService
    const createdAt = (record: ApprovalRecord) =>
      record.approval._tag === "change"
        ? record.approval.change.createdAt
        : record.approval.confirmation.createdAt

    return ApprovalsRpcs.of({
      "Approvals.history": ({ projectId }) =>
        Effect.gen(function* () {
          const all = yield* sessions.list(projectId)
          const records = yield* Effect.forEach(all, (session) =>
            Effect.map(approvals.listForSession(session.id), (list) =>
              list.map((approval): ApprovalRecord => ({
                approval,
                sessionTitle: session.title,
                sessionBranch: session.branch,
              })),
            ),
          )
          return records.flat().sort((a, b) => createdAt(b).localeCompare(createdAt(a)))
        }),
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
