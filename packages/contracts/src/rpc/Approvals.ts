import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  Approval,
  ChangeId,
  ConfirmationId,
  HunkDecisionInput,
  PendingConfirmation,
  ProposedChange,
} from "../domain/Approval.ts"
import { SessionId } from "../domain/Session.ts"
import {
  ApprovalAlreadyDecided,
  ApprovalNotFound,
  IncompleteReview,
  SessionNotFound,
} from "../Errors.ts"

export const ApprovalsRpcs = RpcGroup.make(
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
    },
    success: PendingConfirmation,
    error: Schema.Union([ApprovalNotFound, ApprovalAlreadyDecided]),
  }),
)
