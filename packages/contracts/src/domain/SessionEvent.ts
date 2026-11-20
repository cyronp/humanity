import { Schema } from "effect"
import { Approval } from "./Approval.ts"
import { ChatMessage, Session, SessionStatus, SessionUsage, ToolCall } from "./Session.ts"

export const TRANSCRIPT_PAGE_SIZE = 200

export const TranscriptPage = Schema.Struct({
  messages: Schema.Array(ChatMessage),
  toolCalls: Schema.Array(ToolCall),
  hasEarlier: Schema.Boolean,
})
export type TranscriptPage = typeof TranscriptPage.Type

export const SessionEvent = Schema.Union([
  Schema.TaggedStruct("Snapshot", {
    session: Session,
    messages: Schema.Array(ChatMessage),
    toolCalls: Schema.Array(ToolCall),
    hasEarlier: Schema.Boolean,
    approvals: Schema.Array(Approval),
    usage: SessionUsage,
  }),
  Schema.TaggedStruct("UsageUpdated", { usage: SessionUsage }),
  Schema.TaggedStruct("SessionStatusChanged", {
    status: SessionStatus,
    error: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("SessionUpdated", { session: Session }),
  Schema.TaggedStruct("AgentMessage", { message: ChatMessage }),
  Schema.TaggedStruct("MessageRemoved", { messageId: Schema.String }),
  Schema.TaggedStruct("MessageUpdated", { message: ChatMessage }),
  Schema.TaggedStruct("TextDelta", { text: Schema.String }),
  Schema.TaggedStruct("ToolCallStarted", { toolCall: ToolCall }),
  Schema.TaggedStruct("ToolCallFinished", { toolCall: ToolCall }),
  Schema.TaggedStruct("ApprovalRequested", { approval: Approval }),
  Schema.TaggedStruct("ApprovalResolved", { approval: Approval }),
  Schema.TaggedStruct("SkillLoaded", {
    toolUseId: Schema.String,
    skill: Schema.String,
    at: Schema.String,
  }),
])
export type SessionEvent = typeof SessionEvent.Type
