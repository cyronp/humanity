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

export const ProposedChange = Schema.Struct({
  id: ChangeId,
  sessionId: SessionId,
  toolUseId: Schema.String,
  toolName: Schema.String,
  filePath: Schema.String,
  kind: Schema.Literals(["create", "modify"]),
  originalContent: Schema.String,
  proposedContent: Schema.String,
  hunks: Schema.Array(Hunk),
  status: ProposedChangeStatus,
  comment: Schema.optional(Schema.String),
  createdAt: Schema.String,
  decidedAt: Schema.optional(Schema.String),
})
export type ProposedChange = typeof ProposedChange.Type

export const ConfirmationStatus = Schema.Literals(["pending", "allowed", "denied", "expired"])
export type ConfirmationStatus = typeof ConfirmationStatus.Type

export const PendingConfirmation = Schema.Struct({
  id: ConfirmationId,
  sessionId: SessionId,
  toolUseId: Schema.String,
  toolName: Schema.String,
  input: Schema.Unknown,
  status: ConfirmationStatus,
  comment: Schema.optional(Schema.String),
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

export const ApprovalRecord = Schema.Struct({
  approval: Approval,
  sessionTitle: Schema.String,
  sessionBranch: Schema.String,
})
export type ApprovalRecord = typeof ApprovalRecord.Type

export const ApprovalDecision = Schema.Literals(["allow", "deny"])
export type ApprovalDecision = typeof ApprovalDecision.Type

export const approvalToolName = (approval: Approval): string =>
  approval._tag === "change" ? approval.change.toolName : approval.confirmation.toolName

export const approvalToolUseId = (approval: Approval): string =>
  approval._tag === "change" ? approval.change.toolUseId : approval.confirmation.toolUseId

export const isPendingApproval = (approval: Approval): boolean =>
  approval._tag === "change"
    ? approval.change.status === "pending"
    : approval.confirmation.status === "pending"

export const approvalKey = (approval: Approval): string =>
  approval._tag === "change" ? approval.change.id : approval.confirmation.id
