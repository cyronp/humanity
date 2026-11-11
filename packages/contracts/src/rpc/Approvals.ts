import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  Approval,
  ApprovalRecord,
  ChangeId,
  ConfirmationId,
  HunkDecisionInput,
  PendingConfirmation,
  ProposedChange,
} from "../domain/Approval.ts"
import { ProjectId } from "../domain/Project.ts"
import { QuestionAnswers } from "../domain/Question.ts"
import { SessionId } from "../domain/Session.ts"
import {
  ApprovalAlreadyDecided,
  ApprovalNotFound,
  IncompleteReview,
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
  /** One decision per hunk, all at once. The change is applied, partly applied or rejected. */
  Rpc.make("Approvals.decideChange", {
    payload: { changeId: ChangeId, decisions: Schema.Array(HunkDecisionInput) },
    success: ProposedChange,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided, IncompleteReview]),
  }),
  Rpc.make("Approvals.decideConfirmation", {
    payload: {
      confirmationId: ConfirmationId,
      decision: Schema.Literals(["allow", "deny"]),
      /** Sent to the agent with a denial. */
      comment: Schema.optional(Schema.String),
      /** Also set this tool to `auto` in the project's policy. Only with `allow`. */
      alwaysAllow: Schema.optional(Schema.Boolean),
      /** The human's answers to an `AskUserQuestion` call. Only with `allow`. */
      answers: Schema.optional(QuestionAnswers),
    },
    success: PendingConfirmation,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided]),
  }),
)
