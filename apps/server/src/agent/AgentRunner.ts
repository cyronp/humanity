import type { AgentProvider, ContextUsage, PlanUsage, ReasoningEffort } from "@humanity/contracts"
import { Context, type Effect, Schema, type Scope, type Stream } from "effect"

export type PermissionDecision =
  | {
      readonly behavior: "allow"
      readonly updatedInput?: Record<string, unknown>
    }
  | { readonly behavior: "deny"; readonly message: string }

export interface ToolPermissionRequest {
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly toolUseId: string
}

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

export interface AgentExtensions {
  readonly mcpServers: Readonly<Record<string, AgentMcpServer>>
  readonly plugins: ReadonlyArray<string>
}

export interface AgentRunOptions {
  readonly provider: AgentProvider
  readonly cwd: string
  readonly configDir: string | undefined
  readonly resume: string | undefined
  readonly model: string | undefined
  readonly effort: ReasoningEffort | undefined
  readonly extensions: AgentExtensions
  readonly allowedTools: ReadonlyArray<string>
  readonly canUseTool: (request: ToolPermissionRequest) => Effect.Effect<PermissionDecision>
}

export type AgentImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp"

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
  readonly mentions?: ReadonlyArray<string>
}

export interface AgentRun {
  readonly messages: Stream.Stream<unknown, AgentRunError>
  readonly send: (message: AgentUserMessage) => Effect.Effect<void>
  readonly interrupt: Effect.Effect<void>
  readonly setModel: (model: string | undefined) => Effect.Effect<void, AgentRunError>
  readonly setEffort: (effort: ReasoningEffort | undefined) => Effect.Effect<void, AgentRunError>
  readonly applyExtensions: (extensions: AgentExtensions) => Effect.Effect<void, AgentRunError>
  readonly contextUsage: Effect.Effect<ContextUsage | undefined>
  readonly planUsage: Effect.Effect<PlanUsage | undefined>
}

export class AgentRunError extends Schema.TaggedError<AgentRunError>()("AgentRunError", {
  message: Schema.String,
}) {}

export class AgentRunner extends Context.Service<
  AgentRunner,
  {
    readonly start: (options: AgentRunOptions) => Effect.Effect<AgentRun, never, Scope.Scope>
  }
>()("humanity/AgentRunner") {}
