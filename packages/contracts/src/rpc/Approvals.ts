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
  /** Every decided or pending approval of a project's sessions, newest first. */
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
  /** The whole file change at once: allowed, it is applied; denied, nothing is written. */
  Rpc.make("Approvals.decideChange", {
    payload: {
      changeId: ChangeId,
      decision: ApprovalDecision,
      /** Sent to the agent with a denial. */
      comment: Schema.optional(Schema.String),
      /** Also stop asking about this tool for the rest of the thread. Only with `allow`. */
      allowForSession: Schema.optional(Schema.Boolean),
    },
    success: ProposedChange,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided]),
  }),
  Rpc.make("Approvals.decideConfirmation", {
    payload: {
      confirmationId: ConfirmationId,
      decision: ApprovalDecision,
      /** Sent to the agent with a denial. */
      comment: Schema.optional(Schema.String),
      /** Also stop asking about this tool for the rest of the thread. Only with `allow`. */
      allowForSession: Schema.optional(Schema.Boolean),
      /** The human's answers to an `AskUserQuestion` call. Only with `allow`. */
      answers: Schema.optional(QuestionAnswers),
    },
    success: PendingConfirmation,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided]),
  }),
)
