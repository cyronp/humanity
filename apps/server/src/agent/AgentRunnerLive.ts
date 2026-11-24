import {
  type CanUseTool,
  type HookCallback,
  type McpServerConfig,
  type PermissionResult,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import { type ContextUsage, type ReasoningEffort, toolMode } from "@humanity/contracts"
import { Effect, Layer, Option, Stream } from "effect"
import { ClaudeCode, claudeExecutable, notInstalled } from "../claude/ClaudeCode.ts"
import { Codex } from "../codex/Codex.ts"
import { readPlanUsage } from "../claude/planUsage.ts"
import {
  type AgentExtensions,
  type AgentRun,
  type AgentRunOptions,
  AgentRunError,
  AgentRunner,
  type AgentUserMessage,
} from "./AgentRunner.ts"
import { startCodexRun } from "./CodexRunner.ts"
import { startAcpRun } from "./AcpRunner.ts"
import { systemPromptAppend } from "./instructions.ts"
import { Kiro } from "../kiro/Kiro.ts"
import { Antigravity } from "../antigravity/Antigravity.ts"
import { readClaudeProjectSettingsProblem } from "../claude/projectSettings.ts"

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

export { systemPromptAppend }

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : String(cause)

const notStarted = (message: string): AgentRun => {
  const error = new AgentRunError({ message })
  return {
    messages: Stream.fail(error),
    send: () => Effect.void,
    interrupt: Effect.void,
    setModel: () => Effect.fail(error),
    setEffort: () => Effect.fail(error),
    applyExtensions: () => Effect.fail(error),
    contextUsage: Effect.succeed(undefined),
    planUsage: Effect.succeed(undefined),
  }
}

const quietly = <A, B>(ask: () => Promise<A>, read: (answer: A) => B | undefined) =>
  Effect.tryPromise(ask).pipe(
    Effect.flatMap((answer) => Effect.try(() => read(answer))),
    Effect.timeoutOption("10 seconds"),
    Effect.map(Option.getOrUndefined),
    Effect.orElseSucceed(() => undefined),
  )

const permissionGuard: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {}
  if (toolMode(input.tool_name) === "auto") return {}
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Humanity decides this tool by the thread's permissions.",
    },
  }
}

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

const sdkMcpServers = (extensions: AgentExtensions): Record<string, McpServerConfig> =>
  Object.fromEntries(
    Object.entries(extensions.mcpServers).map(([name, server]): [string, McpServerConfig] => [
      name,
      server.type === "stdio"
        ? { type: "stdio", command: server.command, args: [...server.args], env: { ...server.env } }
        : {
            type: server.type,
            url: server.url,
            headers: { ...server.headers },
            ...(server.timeoutMs === undefined ? {} : { timeout: server.timeoutMs }),
          },
    ]),
  )

export const AgentRunnerLive = Layer.effect(
  AgentRunner,
  Effect.gen(function* () {
    const claude = yield* ClaudeCode
    const codex = yield* Codex
    const startCodex = startCodexRun(codex.connect)
    const kiro = yield* Kiro
    const startKiro = startAcpRun(kiro.connect, kiro.profile)
    const antigravity = yield* Antigravity
    const startAntigravity = startAcpRun(antigravity.connect, antigravity.profile)

    const startClaude = (options: AgentRunOptions) =>
      Effect.gen(function* () {
        const launch = claude.launch()
        if (launch === undefined) return notStarted(notInstalled().reason)
        if (options.trustProjectSettings !== true) {
          const problem = yield* Effect.promise(() => readClaudeProjectSettingsProblem(options.cwd))
          if (problem !== undefined) return notStarted(problem)
        }
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

        const handle = query({
          prompt: inbox,
          options: {
            cwd: options.cwd,
            pathToClaudeCodeExecutable: claudeExecutable(launch),
            ...(options.resume === undefined ? {} : { resume: options.resume }),
            ...(options.resume === undefined || options.forkAt === undefined
              ? {}
              : { forkSession: true, resumeSessionAt: options.forkAt }),
            ...(options.model === undefined ? {} : { model: options.model }),
            ...(options.effort === undefined ? {} : { effort: options.effort }),
            permissionMode: "default",
            allowedTools: [...options.allowedTools],
            canUseTool,
            hooks: { PreToolUse: [{ hooks: [permissionGuard], onFailure: "block" }] },
            settingSources: ["user", "project"],
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append: systemPromptAppend(options.offersOpenThread),
            },
            includePartialMessages: true,
            mcpServers: sdkMcpServers(options.extensions),
            plugins: options.extensions.plugins.map((path) => ({
              type: "local" as const,
              path,
              skipMcpDiscovery: true,
            })),
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
              try: () => handle.applyFlagSettings({ effortLevel: effort ?? null }),
              catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
            }),
          applyExtensions: (extensions: AgentExtensions) =>
            Effect.tryPromise({
              try: async () => {
                await handle.setMcpServers(sdkMcpServers(extensions))
                await handle.reloadPlugins()
              },
              catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
            }),
          contextUsage: quietly(
            () => handle.getContextUsage({ detail: "summary" }),
            (usage): ContextUsage | undefined =>
              usage.maxTokens > 0
                ? { usedTokens: usage.totalTokens, maxTokens: usage.maxTokens }
                : undefined,
          ),
          planUsage: quietly(
            () =>
              handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
                skipBehaviors: true,
              }),
            readPlanUsage,
          ),
        }
      })

    return AgentRunner.of({
      start: (options) => {
        switch (options.provider) {
          case "codex":
            return startCodex(options)
          case "kiro":
            return startKiro(options)
          case "antigravity":
            return startAntigravity(options)
          default:
            return startClaude(options)
        }
      },
    })
  }),
)
