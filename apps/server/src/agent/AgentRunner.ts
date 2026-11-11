import type { ToolMode } from "@humanity/contracts"
import { Context, type Effect, Schema, type Scope, type Stream } from "effect"

/** What Humanity answers when the agent asks to run a tool. */
export type PermissionDecision =
  { readonly behavior: "allow" } | { readonly behavior: "deny"; readonly message: string }

export interface ToolPermissionRequest {
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly toolUseId: string
}

export interface AgentRunOptions {
  /** The session's worktree. The agent never runs anywhere else. */
  readonly cwd: string
  /** SDK session id to resume, if the conversation already exists. */
  readonly resume: string | undefined
  /** The model to run on, or `undefined` for Claude Code's default. */
  readonly model: string | undefined
  /** Tools that run without asking: exactly the project's `auto` tools. */
  readonly allowedTools: ReadonlyArray<string>
  /**
   * The project's policy, consulted before any permission rule from settings
   * files. `toolUseId` identifies the call when the SDK provides it.
   */
  readonly toolMode: (toolName: string, toolUseId: string | undefined) => ToolMode
  /**
   * Decides every tool call that is not in `allowedTools`. The effect is
   * interrupted if the agent aborts the call (for example on interrupt), so
   * anything waiting for a human must clean up in a finalizer.
   */
  readonly canUseTool: (request: ToolPermissionRequest) => Effect.Effect<PermissionDecision>
}

export type AgentImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp"

/** A file sent with a user message, in the form the Messages API takes it. */
export type AgentAttachment =
  | {
      readonly kind: "image"
      readonly name: string
      readonly mediaType: AgentImageMediaType
      readonly base64: string
    }
  | { readonly kind: "pdf"; readonly name: string; readonly base64: string }
  | { readonly kind: "text"; readonly name: string; readonly text: string }

export interface AgentUserMessage {
  readonly text: string
  readonly attachments: ReadonlyArray<AgentAttachment>
}

/** One running agent conversation in streaming input mode. */
export interface AgentRun {
  /** Raw SDK messages, in order. Ends when the run is closed. */
  readonly messages: Stream.Stream<unknown, AgentRunError>
  /** Queues a user message; the agent answers when its current turn is over. */
  readonly send: (message: AgentUserMessage) => Effect.Effect<void>
  /** Stops the current turn. The run stays open for the next message. */
  readonly interrupt: Effect.Effect<void>
  /** Switches the model for the rest of the run; `undefined` is Claude Code's default. */
  readonly setModel: (model: string | undefined) => Effect.Effect<void, AgentRunError>
}

export class AgentRunError extends Schema.TaggedError<AgentRunError>()("AgentRunError", {
  message: Schema.String,
}) {}

/**
 * Owns the Agent SDK. The live layer wraps `query()`; the test layer replays
 * scripted turns, so no test ever reaches the Anthropic API.
 */
export class AgentRunner extends Context.Service<
  AgentRunner,
  {
    /** Starts a run that lives until the scope closes. */
    readonly start: (options: AgentRunOptions) => Effect.Effect<AgentRun, never, Scope.Scope>
  }
>()("humanity/AgentRunner") {}
