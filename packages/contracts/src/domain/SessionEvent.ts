import { Schema } from "effect"
import { Approval } from "./Approval.ts"
import { ChatMessage, Session, SessionStatus, SessionUsage, ToolCall } from "./Session.ts"

/** How many messages a snapshot, or one page of earlier ones, carries at most. */
export const TRANSCRIPT_PAGE_SIZE = 200

/**
 * A run of a session's messages, oldest first, with the tool calls their
 * tool_use blocks started. `hasEarlier` says older messages exist before it.
 */
export const TranscriptPage = Schema.Struct({
  messages: Schema.Array(ChatMessage),
  toolCalls: Schema.Array(ToolCall),
  hasEarlier: Schema.Boolean,
})
export type TranscriptPage = typeof TranscriptPage.Type

/** Events streamed by `Sessions.subscribe`. */
export const SessionEvent = Schema.Union([
  /**
   * First event of every subscription: the current state, with the latest
   * messages only. `Sessions.earlierMessages` pages back through the rest.
   */
  Schema.TaggedStruct("Snapshot", {
    session: Session,
    /** The latest `TRANSCRIPT_PAGE_SIZE` messages at most. */
    messages: Schema.Array(ChatMessage),
    /** The tool calls started by `messages`. */
    toolCalls: Schema.Array(ToolCall),
    /** Older messages exist than the first of `messages`. */
    hasEarlier: Schema.Boolean,
    /** Every approval of the session, pending and decided. */
    approvals: Schema.Array(Approval),
    usage: SessionUsage,
  }),
  /** The context window or the plan's limits moved. */
  Schema.TaggedStruct("UsageUpdated", { usage: SessionUsage }),
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
