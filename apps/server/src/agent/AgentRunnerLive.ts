import {
  type CanUseTool,
  type HookCallback,
  type PermissionResult,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import { Effect, Layer, Stream } from "effect"
import { ServerConfig } from "../ServerConfig.ts"
import { type AgentRunOptions, AgentRunError, AgentRunner } from "./AgentRunner.ts"

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
When a tool call is denied or only partly applied, the message you receive is the human's decision and feedback. Follow it, and re-read files before editing them again.`

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : String(cause)

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

export const AgentRunnerLive = Layer.effect(
  AgentRunner,
  Effect.gen(function* () {
    const config = yield* ServerConfig

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
                ? { behavior: "allow", updatedInput: input }
                : { behavior: "deny", message: decision.message },
            (): PermissionResult => ({
              behavior: "deny",
              message: "The tool call was cancelled before the human decided.",
            }),
          )

        const handle = query({
          prompt: inbox,
          options: {
            cwd: options.cwd,
            ...(options.resume === undefined ? {} : { resume: options.resume }),
            // Every non-auto call must reach canUseTool. Never bypassPermissions.
            permissionMode: "default",
            allowedTools: [...options.allowedTools],
            canUseTool,
            hooks: { PreToolUse: [{ hooks: [policyGuard(options)], onFailure: "block" }] },
            // Loads the repository's CLAUDE.md, skills and project settings only.
            settingSources: ["project"],
            systemPrompt: { type: "preset", preset: "claude_code", append: SYSTEM_PROMPT_APPEND },
            includePartialMessages: true,
            // Keeps the SDK's transcripts and state inside Humanity's data directory.
            env: {
              ...process.env,
              CLAUDE_CONFIG_DIR: config.claudeConfigDir,
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
          send: (text: string) =>
            Effect.sync(() =>
              inbox.push({
                type: "user",
                message: { role: "user", content: text },
                parent_tool_use_id: null,
              }),
            ),
          interrupt: Effect.tryPromise(() => handle.interrupt()).pipe(Effect.ignore),
        }
      })

    return AgentRunner.of({ start })
  }),
)
