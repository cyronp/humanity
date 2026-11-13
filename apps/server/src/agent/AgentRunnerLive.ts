import {
  type CanUseTool,
  type HookCallback,
  type McpServerConfig,
  type PermissionResult,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import { type ContextUsage, HUMANITY_MCP_SERVER, type ReasoningEffort } from "@humanity/contracts"
import { Effect, Layer, Option, Stream } from "effect"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { readPlanUsage } from "../claude/planUsage.ts"
import {
  type AgentExtensions,
  type AgentRunOptions,
  AgentRunError,
  AgentRunner,
  type AgentUserMessage,
} from "./AgentRunner.ts"
import { humanityMcpServer } from "./humanityTools.ts"

/** An async iterable fed from outside: the SDK's streaming input. */
class Inbox<T> implements AsyncIterable<T> {
  private readonly items: Array<T> = []
  private waiting: ((result: IteratorResult<T>) => void) | undefined
  private ended = false

  push(item: T): void {
    if (this.ended) return
    if (this.waiting) {
      const resolve = this.waiting
      this.waiting = undefined
      resolve({ value: item, done: false })
    } else {
      this.items.push(item)
    }
  }

  end(): void {
    this.ended = true
    this.waiting?.({ value: undefined, done: true })
    this.waiting = undefined
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item !== undefined) return Promise.resolve({ value: item, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => {
          this.waiting = resolve
        })
      },
    }
  }
}

const SYSTEM_PROMPT_APPEND = `You are running inside Humanity, a human-in-the-loop coding app.
Every file change you propose is reviewed by a human, hunk by hunk, before it reaches disk; shell commands and MCP tools need the human's explicit approval.
When a tool call is denied or only partly applied, the message you receive is the human's decision and feedback. Follow it, and re-read files before editing them again.
When the human asks you to open or start a new thread, use the mcp__humanity__open_thread tool. Do not use it on your own initiative.`

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : String(cause)

/**
 * Asks the agent process something that is only nice to know: a failure, a
 * shape Humanity does not expect or no answer in time all read as `undefined`.
 */
const quietly = <A, B>(ask: () => Promise<A>, read: (answer: A) => B | undefined) =>
  Effect.tryPromise(ask).pipe(
    Effect.flatMap((answer) => Effect.try(() => read(answer))),
    Effect.timeoutOption("10 seconds"),
    Effect.map(Option.getOrUndefined),
    Effect.orElseSucceed(() => undefined),
  )

/**
 * The project's policy runs before the SDK applies permission rules from
 * settings files, so a repository cannot pre-approve a tool Humanity wants a
 * human to see: anything not `auto` is forced into `canUseTool`.
 */
const policyGuard =
  (options: AgentRunOptions): HookCallback =>
  async (input, toolUseId) => {
    if (input.hook_event_name !== "PreToolUse") return {}
    const mode = options.toolMode(input.tool_name, toolUseId)
    if (mode === "auto") return {}
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: mode === "deny" ? "deny" : "ask",
        permissionDecisionReason:
          mode === "deny"
            ? `The project's Humanity policy denies ${input.tool_name}.`
            : "Humanity requires a human decision for this tool.",
      },
    }
  }

/**
 * A user message for the Messages API. Files go first, each document titled
 * with its name, then the text, as the API recommends for images and documents.
 */
const userContent = (message: AgentUserMessage): SDKUserMessage["message"]["content"] => {
  if (message.attachments.length === 0) return message.text
  return [
    ...message.attachments.map((file) => {
      switch (file.kind) {
        case "image":
          return {
            type: "image" as const,
            source: { type: "base64" as const, media_type: file.mediaType, data: file.base64 },
          }
        case "pdf":
          return {
            type: "document" as const,
            title: file.name,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: file.base64,
            },
          }
        case "text":
          return {
            type: "document" as const,
            title: file.name,
            source: { type: "text" as const, media_type: "text/plain" as const, data: file.text },
          }
      }
    }),
    { type: "text" as const, text: message.text },
  ]
}

/** Humanity's MCP servers in the SDK's (mutable) configuration types. */
const sdkMcpServers = (extensions: AgentExtensions): Record<string, McpServerConfig> =>
  Object.fromEntries(
    Object.entries(extensions.mcpServers).map(([name, server]): [string, McpServerConfig] => [
      name,
      server.type === "stdio"
        ? { type: "stdio", command: server.command, args: [...server.args], env: { ...server.env } }
        : { type: server.type, url: server.url, headers: { ...server.headers } },
    ]),
  )

export const AgentRunnerLive = Layer.effect(
  AgentRunner,
  Effect.gen(function* () {
    const claude = yield* ClaudeCode

    const start = (options: AgentRunOptions) =>
      Effect.gen(function* () {
        const context = yield* Effect.context<never>()
        const runPromise = Effect.runPromiseWith(context)
        const inbox = new Inbox<SDKUserMessage>()

        const canUseTool: CanUseTool = (toolName, input, { signal, toolUseID }) =>
          runPromise(options.canUseTool({ toolName, input, toolUseId: toolUseID }), {
            signal,
          }).then(
            (decision): PermissionResult =>
              decision.behavior === "allow"
                ? { behavior: "allow", updatedInput: decision.updatedInput ?? input }
                : { behavior: "deny", message: decision.message },
            (): PermissionResult => ({
              behavior: "deny",
              message: "The tool call was cancelled before the human decided.",
            }),
          )

        // Humanity's own tools, under a name no server the human added can take.
        const mcpServers = (extensions: AgentExtensions): Record<string, McpServerConfig> => ({
          ...sdkMcpServers(extensions),
          [HUMANITY_MCP_SERVER]: humanityTools,
        })
        const humanityTools = humanityMcpServer(options, runPromise)

        const handle = query({
          prompt: inbox,
          options: {
            cwd: options.cwd,
            ...(options.resume === undefined ? {} : { resume: options.resume }),
            ...(options.model === undefined ? {} : { model: options.model }),
            ...(options.effort === undefined ? {} : { effort: options.effort }),
            // Every non-auto call must reach canUseTool. Never bypassPermissions.
            permissionMode: "default",
            allowedTools: [...options.allowedTools],
            canUseTool,
            hooks: { PreToolUse: [{ hooks: [policyGuard(options)], onFailure: "block" }] },
            // Loads the human's user settings (e.g. `attribution` for commit trailers)
            // and the repository's CLAUDE.md, skills and project settings.
            settingSources: ["user", "project"],
            systemPrompt: { type: "preset", preset: "claude_code", append: SYSTEM_PROMPT_APPEND },
            includePartialMessages: true,
            // Humanity's own servers and skills. Their MCP tools still go through the policy.
            mcpServers: mcpServers(options.extensions),
            plugins: options.extensions.plugins.map((path) => ({
              type: "local" as const,
              path,
              skipMcpDiscovery: true,
            })),
            // Claude Code's own environment and config directory, so it signs in
            // with the human's login (`claude auth login`), like the account check.
            env: {
              ...claude.environment,
              ...(options.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: options.configDir }),
              CLAUDE_AGENT_SDK_CLIENT_APP: "humanity/0.1.0",
            },
            stderr: (data) => {
              runPromise(Effect.logDebug("agent stderr", data.trimEnd())).catch(() => {})
            },
          },
        })

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            inbox.end()
            handle.close()
          }),
        )

        return {
          messages: Stream.fromAsyncIterable(
            handle,
            (cause) => new AgentRunError({ message: errorMessage(cause) }),
          ),
          send: (message: AgentUserMessage) =>
            Effect.sync(() =>
              inbox.push({
                type: "user",
                message: { role: "user", content: userContent(message) },
                parent_tool_use_id: null,
              }),
            ),
          interrupt: Effect.tryPromise(() => handle.interrupt()).pipe(Effect.ignore),
          setModel: (model: string | undefined) =>
            Effect.tryPromise({
              try: () => handle.setModel(model),
              catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
            }),
          setEffort: (effort: ReasoningEffort | undefined) =>
            Effect.tryPromise({
              // `null` resets the session to the model's default effort.
              try: () => handle.applyFlagSettings({ effortLevel: effort ?? null }),
              catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
            }),
          applyExtensions: (extensions: AgentExtensions) =>
            Effect.tryPromise({
              try: async () => {
                await handle.setMcpServers(mcpServers(extensions))
                // Re-reads the plugin folders, so added, edited and removed skills show.
                await handle.reloadPlugins()
              },
              catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
            }),
          // "summary" answers from the last response's usage, without token-count calls.
          contextUsage: quietly(
            () => handle.getContextUsage({ detail: "summary" }),
            (usage): ContextUsage | undefined =>
              usage.maxTokens > 0
                ? { usedTokens: usage.totalTokens, maxTokens: usage.maxTokens }
                : undefined,
          ),
          // The SDK marks this call experimental: any surprise reads as "cannot say".
          planUsage: quietly(
            () =>
              handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
                skipBehaviors: true,
              }),
            readPlanUsage,
          ),
        }
      })

    return AgentRunner.of({ start })
  }),
)
