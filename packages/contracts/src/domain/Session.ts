import { Schema } from "effect"
import { Attachment } from "./Attachment.ts"
import { FileMentions } from "./Mention.ts"
import { Autonomy } from "./Policy.ts"
import { ProjectId } from "./Project.ts"
import { AgentProvider } from "./Provider.ts"

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

export const SessionOrigin = Schema.Literals(["humanity", "claude-code"])
export type SessionOrigin = typeof SessionOrigin.Type

export const ReasoningEffort = Schema.Literals(["low", "medium", "high", "xhigh", "max"])
export type ReasoningEffort = typeof ReasoningEffort.Type

export const Session = Schema.Struct({
  id: SessionId,
  projectId: ProjectId,
  provider: AgentProvider,
  sdkSessionId: Schema.NullOr(Schema.String),
  title: Schema.String,
  branch: Schema.String,
  worktreePath: Schema.String,
  inWorktree: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
  effort: Schema.NullOr(ReasoningEffort),
  autonomy: Autonomy,
  status: SessionStatus,
  origin: SessionOrigin,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Session = typeof Session.Type

export const acceptsMessages = (session: Session): boolean =>
  session.status !== "ended" || (session.origin === "claude-code" && !session.inWorktree)

export const ContextUsage = Schema.Struct({
  usedTokens: Schema.Number,
  maxTokens: Schema.Number,
})
export type ContextUsage = typeof ContextUsage.Type

export const PlanWindow = Schema.Struct({
  utilization: Schema.Number,
  resetsAt: Schema.NullOr(Schema.String),
})
export type PlanWindow = typeof PlanWindow.Type

export const PlanUsage = Schema.Struct({
  fiveHour: Schema.NullOr(PlanWindow),
  sevenDay: Schema.NullOr(PlanWindow),
  models: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      utilization: Schema.Number,
      resetsAt: Schema.NullOr(Schema.String),
    }),
  ),
})
export type PlanUsage = typeof PlanUsage.Type

export const SessionUsage = Schema.Struct({
  context: Schema.NullOr(ContextUsage),
  plan: Schema.NullOr(PlanUsage),
})
export type SessionUsage = typeof SessionUsage.Type

export const NO_USAGE: SessionUsage = { context: null, plan: null }

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
  Schema.TaggedStruct("user", {
    text: Schema.String,
    attachments: Schema.optional(Schema.Array(Attachment)),
    mentions: Schema.optional(FileMentions),
  }),
  Schema.TaggedStruct("assistant", {
    blocks: Schema.Array(AssistantBlock),
    parentToolUseId: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("tool_results", {
    results: Schema.Array(ToolResult),
    parentToolUseId: Schema.NullOr(Schema.String),
  }),
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
  Schema.TaggedStruct("notice", {
    level: Schema.Literals(["info", "warning", "error"]),
    text: Schema.String,
  }),
  /**
   * The thread moved to another provider (or account). `resumed` when the target picked up its own
   * earlier conversation; otherwise it got the conversation as context, `included` of its entries
   * in full and `omitted` left for `thread_history`. `tokens` estimates what the handoff costs.
   */
  Schema.TaggedStruct("provider_switch", {
    from: AgentProvider,
    to: AgentProvider,
    model: Schema.NullOr(Schema.String),
    resumed: Schema.Boolean,
    included: Schema.Number,
    omitted: Schema.Number,
    tokens: Schema.optional(Schema.Number),
  }),
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
  structuredOutput: Schema.optional(Schema.Unknown),
  status: ToolCallStatus,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
})
export type ToolCall = typeof ToolCall.Type
