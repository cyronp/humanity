import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  Approval,
  ApprovalDecision,
  ApprovalRecord,
  ChangeId,
  ConfirmationId,
  PendingConfirmation,
  ProposedChange,
} from "../domain/Approval.ts"
import { ProjectId } from "../domain/Project.ts"
import { QuestionAnswers } from "../domain/Question.ts"
import { SessionId } from "../domain/Session.ts"
import {
  ApprovalAlreadyDecided,
  ApprovalNotFound,
  ProjectNotFound,
  SessionNotFound,
} from "../Errors.ts"

export const ApprovalsRpcs = RpcGroup.make(
  Rpc.make("Approvals.history", {
    payload: { projectId: ProjectId },
    success: Schema.Array(ApprovalRecord),
    error: ProjectNotFound,
  }),
  Rpc.make("Approvals.listPending", {
    payload: { sessionId: SessionId },
    success: Schema.Array(Approval),
    error: SessionNotFound,
  }),
  Rpc.make("Approvals.decideChange", {
    payload: {
      changeId: ChangeId,
      decision: ApprovalDecision,
      comment: Schema.optional(Schema.String),
      allowForSession: Schema.optional(Schema.Boolean),
    },
    success: ProposedChange,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided]),
  }),
  Rpc.make("Approvals.decideConfirmation", {
    payload: {
      confirmationId: ConfirmationId,
      decision: ApprovalDecision,
      comment: Schema.optional(Schema.String),
      allowForSession: Schema.optional(Schema.Boolean),
      answers: Schema.optional(QuestionAnswers),
    },
    success: PendingConfirmation,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided]),
  }),
)
