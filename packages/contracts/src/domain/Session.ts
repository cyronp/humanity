import { Schema } from "effect"
import { Attachment } from "./Attachment.ts"
import { Autonomy } from "./Policy.ts"
import { ProjectId } from "./Project.ts"

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type

export const SessionStatus = Schema.Literals([
  "idle",
  "running",
  "waiting_for_human",
  "interrupted",
  "error",
  "ended",
])
export type SessionStatus = typeof SessionStatus.Type

export const Session = Schema.Struct({
  id: SessionId,
  projectId: ProjectId,
  /** The Agent SDK's own session id, known after the first turn; used to resume. */
  sdkSessionId: Schema.NullOr(Schema.String),
  title: Schema.String,
  /**
   * The session's own `humanity/…` branch once it has a worktree. Before that,
   * the branch the project's checkout was on when the session started.
   */
  branch: Schema.String,
  /**
   * Absolute path the agent works in: the session's own git worktree under the
   * data directory when `inWorktree`, otherwise the project's checkout.
   */
  worktreePath: Schema.String,
  /** False until the human sets up a worktree; the agent works in the project's checkout until then. */
  inWorktree: Schema.Boolean,
  /** The model the agent runs on (a value Claude Code reported), or `null` for Claude Code's default. */
  model: Schema.NullOr(Schema.String),
  /** How much the agent may do without asking, on top of the project's policy. */
  autonomy: Autonomy,
  status: SessionStatus,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Session = typeof Session.Type

// ---------------------------------------------------------------------------
// Normalized messages. The raw SDK message is stored next to these in the
// database, so renderers can be improved later without losing data.
// ---------------------------------------------------------------------------

export const TextBlock = Schema.TaggedStruct("text", { text: Schema.String })
export const ThinkingBlock = Schema.TaggedStruct("thinking", { text: Schema.String })
export const ToolUseBlock = Schema.TaggedStruct("tool_use", {
  toolUseId: Schema.String,
  toolName: Schema.String,
  input: Schema.Unknown,
})
export const AssistantBlock = Schema.Union([TextBlock, ThinkingBlock, ToolUseBlock])
export type AssistantBlock = typeof AssistantBlock.Type

export const ToolResult = Schema.Struct({
  toolUseId: Schema.String,
  /** The text the model saw. Images and other blocks are summarized. */
  content: Schema.String,
  isError: Schema.Boolean,
})
export type ToolResult = typeof ToolResult.Type

export const UsageSummary = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadTokens: Schema.Number,
  cacheCreationTokens: Schema.Number,
})
export type UsageSummary = typeof UsageSummary.Type

export const MessageContent = Schema.Union([
  /** A message the human sent. */
  Schema.TaggedStruct("user", {
    text: Schema.String,
    /** Files sent with the message. Absent on messages without any. */
    attachments: Schema.optional(Schema.Array(Attachment)),
  }),
  Schema.TaggedStruct("assistant", {
    blocks: Schema.Array(AssistantBlock),
    /** Set for messages produced inside a subagent's tool call. */
    parentToolUseId: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("tool_results", {
    results: Schema.Array(ToolResult),
    parentToolUseId: Schema.NullOr(Schema.String),
  }),
  /** End of a turn: how it ended, what it cost. */
  Schema.TaggedStruct("result", {
    subtype: Schema.String,
    isError: Schema.Boolean,
    text: Schema.NullOr(Schema.String),
    durationMs: Schema.Number,
    numTurns: Schema.Number,
    costUsd: Schema.Number,
    usage: UsageSummary,
  }),
  Schema.TaggedStruct("system_init", {
    model: Schema.String,
    tools: Schema.Array(Schema.String),
    skills: Schema.Array(Schema.String),
    mcpServers: Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String })),
  }),
  /** Something Humanity itself wants the human to see in the transcript. */
  Schema.TaggedStruct("notice", {
    level: Schema.Literals(["info", "warning", "error"]),
    text: Schema.String,
  }),
  /** SDK messages Humanity does not render yet. Kept so nothing is lost. */
  Schema.TaggedStruct("other", { type: Schema.String, subtype: Schema.NullOr(Schema.String) }),
])
export type MessageContent = typeof MessageContent.Type

export const ChatMessage = Schema.Struct({
  id: Schema.String,
  sessionId: SessionId,
  content: MessageContent,
  createdAt: Schema.String,
})
export type ChatMessage = typeof ChatMessage.Type

export const ToolCallStatus = Schema.Literals(["running", "succeeded", "failed", "denied"])
export type ToolCallStatus = typeof ToolCallStatus.Type

export const ToolCall = Schema.Struct({
  id: Schema.String,
  sessionId: SessionId,
  toolUseId: Schema.String,
  toolName: Schema.String,
  input: Schema.Unknown,
  output: Schema.NullOr(ToolResult),
  /** The tool's structured result (`tool_use_result`), when the SDK provides one. */
  structuredOutput: Schema.optional(Schema.Unknown),
  status: ToolCallStatus,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
})
export type ToolCall = typeof ToolCall.Type
