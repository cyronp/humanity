import { Schema } from "effect"
import { Hunk } from "./Diff.ts"
import { QuestionAnswers } from "./Question.ts"
import { SessionId } from "./Session.ts"

export const ChangeId = Schema.String.pipe(Schema.brand("ChangeId"))
export type ChangeId = typeof ChangeId.Type

export const ConfirmationId = Schema.String.pipe(Schema.brand("ConfirmationId"))
export type ConfirmationId = typeof ConfirmationId.Type

export const ProposedChangeStatus = Schema.Literals([
  "pending",
  "applied",
  "partially_applied",
  "rejected",
  "expired",
])
export type ProposedChangeStatus = typeof ProposedChangeStatus.Type

/** A file change the agent wants to make, split into hunks for review. */
export const ProposedChange = Schema.Struct({
  id: ChangeId,
  sessionId: SessionId,
  toolUseId: Schema.String,
  toolName: Schema.String,
  /** Relative to the folder the session works in, with forward slashes. */
  filePath: Schema.String,
  kind: Schema.Literals(["create", "modify"]),
  originalContent: Schema.String,
  proposedContent: Schema.String,
  hunks: Schema.Array(Hunk),
  status: ProposedChangeStatus,
  createdAt: Schema.String,
  decidedAt: Schema.optional(Schema.String),
})
export type ProposedChange = typeof ProposedChange.Type

export const ConfirmationStatus = Schema.Literals(["pending", "allowed", "denied", "expired"])
export type ConfirmationStatus = typeof ConfirmationStatus.Type

/** A tool call (shell command, MCP tool, ...) waiting for an allow or deny. */
export const PendingConfirmation = Schema.Struct({
  id: ConfirmationId,
  sessionId: SessionId,
  toolUseId: Schema.String,
  toolName: Schema.String,
  input: Schema.Unknown,
  status: ConfirmationStatus,
  comment: Schema.optional(Schema.String),
  /** What the human answered, when the call was the agent asking a question. */
  answers: Schema.optional(QuestionAnswers),
  createdAt: Schema.String,
  decidedAt: Schema.optional(Schema.String),
})
export type PendingConfirmation = typeof PendingConfirmation.Type

export const Approval = Schema.Union([
  Schema.TaggedStruct("change", { change: ProposedChange }),
  Schema.TaggedStruct("confirmation", { confirmation: PendingConfirmation }),
])
export type Approval = typeof Approval.Type

/** An approval with the session it belongs to, for a project-wide history. */
export const ApprovalRecord = Schema.Struct({
  approval: Approval,
  sessionTitle: Schema.String,
  sessionBranch: Schema.String,
})
export type ApprovalRecord = typeof ApprovalRecord.Type

export const HunkDecisionInput = Schema.Struct({
  /** The hunk's 1-based index. */
  index: Schema.Int,
  decision: Schema.Literals(["approved", "rejected"]),
  comment: Schema.optional(Schema.String),
})
export type HunkDecisionInput = typeof HunkDecisionInput.Type

export const approvalToolUseId = (approval: Approval): string =>
  approval._tag === "change" ? approval.change.toolUseId : approval.confirmation.toolUseId

export const isPendingApproval = (approval: Approval): boolean =>
  approval._tag === "change"
    ? approval.change.status === "pending"
    : approval.confirmation.status === "pending"

export const approvalKey = (approval: Approval): string =>
  approval._tag === "change" ? approval.change.id : approval.confirmation.id
