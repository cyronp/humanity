import type {
  ContextUsage,
  OpenedThread,
  PlanUsage,
  ReasoningEffort,
  ToolMode,
} from "@humanity/contracts"
import { Context, Data, type Effect, Schema, type Scope, type Stream } from "effect"

/** What Humanity answers when the agent asks to run a tool. */
export type PermissionDecision =
  | {
      readonly behavior: "allow"
      /** The input the tool runs with instead of the agent's own: the answers to a question. */
      readonly updatedInput?: Record<string, unknown>
    }
  | { readonly behavior: "deny"; readonly message: string }

export interface ToolPermissionRequest {
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly toolUseId: string
}

/** What the agent passes to Humanity's `open_thread` tool. */
export interface OpenThreadRequest {
  /** The new thread's first message. */
  readonly prompt: string
  readonly title?: string | undefined
  /** A model as Claude Code names it; left out, the thread runs on Claude Code's default. */
  readonly model?: string | undefined
  readonly effort?: ReasoningEffort | undefined
}

/** Why a thread was not opened, in words the agent can act on. */
export class OpenThreadFailed extends Data.TaggedError("OpenThreadFailed")<{
  readonly reason: string
}> {}

/** An MCP server as the agent is given it, in the SDK's configuration format. */
export type AgentMcpServer =
  | {
      readonly type: "stdio"
      readonly command: string
      readonly args: ReadonlyArray<string>
      readonly env: Readonly<Record<string, string>>
    }
  | {
      readonly type: "http" | "sse"
      readonly url: string
      readonly headers: Readonly<Record<string, string>>
    }

/**
 * What Humanity adds to the agent on top of the repository's own settings:
 * its enabled MCP servers and the plugin folders its skills live in.
 */
export interface AgentExtensions {
  readonly mcpServers: Readonly<Record<string, AgentMcpServer>>
  /** Absolute paths of local Claude Code plugins. */
  readonly plugins: ReadonlyArray<string>
}

export interface AgentRunOptions {
  /** The session's worktree. The agent never runs anywhere else. */
  readonly cwd: string
  /**
   * The Claude Code config folder of the account the session runs as, or
   * `undefined` for Claude Code's default login.
   */
  readonly configDir: string | undefined
  /** SDK session id to resume, if the conversation already exists. */
  readonly resume: string | undefined
  /** The model to run on, or `undefined` for Claude Code's default. */
  readonly model: string | undefined
  /** How hard the model reasons, or `undefined` for the model's default. */
  readonly effort: ReasoningEffort | undefined
  /** Humanity's MCP servers and skills, as they are when the run starts. */
  readonly extensions: AgentExtensions
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
  /**
   * Humanity's `open_thread` tool: starts a new thread in the session's
   * project on the given prompt. The call itself goes through the policy like
   * any other tool before this runs.
   */
  readonly openThread: (request: OpenThreadRequest) => Effect.Effect<OpenedThread, OpenThreadFailed>
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
  /** Switches the reasoning effort for the rest of the run; `undefined` is the model's default. */
  readonly setEffort: (effort: ReasoningEffort | undefined) => Effect.Effect<void, AgentRunError>
  /**
   * Replaces Humanity's MCP servers and reloads its skills, for the next turn
   * on. The repository's own servers and skills are not touched.
   */
  readonly applyExtensions: (extensions: AgentExtensions) => Effect.Effect<void, AgentRunError>
  /** How full the context window is right now; `undefined` when the agent cannot say. */
  readonly contextUsage: Effect.Effect<ContextUsage | undefined>
  /**
   * The claude.ai plan's rate-limit windows; `undefined` when the agent cannot
   * say or the login has no plan limits (an API key).
   */
  readonly planUsage: Effect.Effect<PlanUsage | undefined>
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
