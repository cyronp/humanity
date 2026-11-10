import { Schema } from "effect"
import { Approval } from "./Approval.ts"
import { ChatMessage, Session, SessionStatus, ToolCall } from "./Session.ts"

/** Events streamed by `Sessions.subscribe`. */
export const SessionEvent = Schema.Union([
  /** First event of every subscription: the whole current state. */
  Schema.TaggedStruct("Snapshot", {
    session: Session,
    messages: Schema.Array(ChatMessage),
    toolCalls: Schema.Array(ToolCall),
    /** Every approval of the session, pending and decided. */
    approvals: Schema.Array(Approval),
  }),
  Schema.TaggedStruct("SessionStatusChanged", {
    status: SessionStatus,
    /** Why the session stopped, when it stopped because of an error. */
    error: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("SessionUpdated", { session: Session }),
  Schema.TaggedStruct("AgentMessage", { message: ChatMessage }),
  /** Streamed text of the assistant message being written. Not persisted. */
  Schema.TaggedStruct("TextDelta", { text: Schema.String }),
  Schema.TaggedStruct("ToolCallStarted", { toolCall: ToolCall }),
  Schema.TaggedStruct("ToolCallFinished", { toolCall: ToolCall }),
  /** The agent is blocked until the human decides. */
  Schema.TaggedStruct("ApprovalRequested", { approval: Approval }),
  /** Decided, or expired because the agent was interrupted. */
  Schema.TaggedStruct("ApprovalResolved", { approval: Approval }),
  Schema.TaggedStruct("SkillLoaded", {
    toolUseId: Schema.String,
    skill: Schema.String,
    at: Schema.String,
  }),
])
export type SessionEvent = typeof SessionEvent.Type
