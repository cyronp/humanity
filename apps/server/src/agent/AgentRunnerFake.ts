import { simulateEdit, simulateWrite } from "@humanity/diff"
import { Context, Effect, Fiber, Layer, Option, Queue, Ref, Stream } from "effect"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import {
  type AgentRunOptions,
  AgentRunner,
  type PermissionDecision,
  type ToolPermissionRequest,
} from "./AgentRunner.ts"

/** One scripted beat of an agent turn. */
export type FakeStep =
  | { readonly text: string }
  | {
      readonly tool: string
      readonly input: Record<string, unknown>
      /** What the tool "returns" when it runs. Edit and Write really change the file. */
      readonly output?: string
    }
  /** Keeps the turn busy until it is interrupted, like a long tool call. */
  | { readonly hang: true }

/** Decides what the fake agent does with each user message. */
export type FakeScript = (prompt: string, turn: number) => ReadonlyArray<FakeStep>

export interface PermissionLogEntry extends ToolPermissionRequest {
  readonly decision: PermissionDecision | "interrupted"
}

/** Lets tests inspect what the fake agent was asked to do and what it was told. */
export class FakeAgentLog extends Context.Service<
  FakeAgentLog,
  {
    readonly runs: Ref.Ref<ReadonlyArray<AgentRunOptions>>
    readonly prompts: Ref.Ref<ReadonlyArray<string>>
    readonly permissions: Ref.Ref<ReadonlyArray<PermissionLogEntry>>
  }
>()("humanity/test/FakeAgentLog") {}

const readOrEmpty = (path: string) => {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return ""
  }
}

/** Runs Edit and Write for real, inside the run's cwd, like the SDK would after an `allow`. */
const executeTool = (cwd: string, step: Extract<FakeStep, { tool: string }>) => {
  if (step.tool !== "Edit" && step.tool !== "Write") {
    return { content: step.output ?? `${step.tool} ran.`, isError: false }
  }
  const rawPath = String(step.input["file_path"] ?? "")
  const path = isAbsolute(rawPath) ? rawPath : join(cwd, rawPath)
  const simulation =
    step.tool === "Write"
      ? simulateWrite({ content: String(step.input["content"] ?? "") })
      : simulateEdit(readOrEmpty(path), {
          old_string: String(step.input["old_string"] ?? ""),
          new_string: String(step.input["new_string"] ?? ""),
          replace_all: step.input["replace_all"] === true,
        })
  if (!simulation.ok) return { content: simulation.reason, isError: true }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, simulation.content)
  return { content: step.output ?? `The file ${rawPath} has been updated.`, isError: false }
}

/**
 * A scripted stand-in for the Agent SDK. It emits SDK-shaped messages, asks
 * `canUseTool` exactly where the real SDK would (anything not in
 * `allowedTools`, after the policy guard), and honors interrupts by aborting
 * the pending permission request.
 */
export const AgentRunnerFake = (script: FakeScript) =>
  Layer.effect(
    AgentRunner,
    Effect.gen(function* () {
      const log = yield* FakeAgentLog
      let runCounter = 0

      const start = (options: AgentRunOptions) =>
        Effect.gen(function* () {
          yield* Ref.update(log.runs, (runs) => [...runs, options])
          const runNumber = ++runCounter
          const sdkSessionId = options.resume ?? `fake-sdk-session-${runNumber}`
          const outbox = yield* Queue.unbounded<unknown>()
          const prompts = yield* Queue.unbounded<string>()
          const current = yield* Ref.make(Option.none<Fiber.Fiber<void>>())
          let turn = 0
          // Prompts sent but not finished, and an interrupt that arrived before its turn began.
          let pending = 0
          let interruptRequested = false
          let toolCounter = 0
          const emit = (message: unknown) => Queue.offer(outbox, message).pipe(Effect.asVoid)

          const base = { session_id: sdkSessionId, uuid: "00000000-0000-0000-0000-000000000000" }
          const assistant = (content: ReadonlyArray<unknown>) =>
            emit({ type: "assistant", message: { content }, parent_tool_use_id: null, ...base })

          const decide = (step: Extract<FakeStep, { tool: string }>, toolUseId: string) =>
            Effect.gen(function* () {
              const mode = options.toolMode(step.tool)
              if (mode === "deny") {
                return {
                  behavior: "deny",
                  message: `The project's Humanity policy denies ${step.tool}.`,
                } satisfies PermissionDecision
              }
              if (mode === "auto" && options.allowedTools.includes(step.tool)) {
                return { behavior: "allow" } satisfies PermissionDecision
              }
              const request = { toolName: step.tool, input: step.input, toolUseId }
              return yield* options.canUseTool(request).pipe(
                Effect.tap((decision) =>
                  Ref.update(log.permissions, (entries) => [...entries, { ...request, decision }]),
                ),
                Effect.onInterrupt(() =>
                  Ref.update(log.permissions, (entries) => [
                    ...entries,
                    { ...request, decision: "interrupted" as const },
                  ]),
                ),
              )
            })

          const emitInterrupted = emit({
            type: "result",
            subtype: "error_during_execution",
            is_error: true,
            duration_ms: 1,
            num_turns: 1,
            total_cost_usd: 0,
            ...base,
          })

          const runTurn = (prompt: string) =>
            Effect.gen(function* () {
              turn++
              if (turn === 1) {
                yield* emit({
                  type: "system",
                  subtype: "init",
                  model: "fake-model",
                  tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash", "Skill"],
                  skills: [],
                  mcp_servers: [],
                  ...base,
                })
              }
              let lastText: string | undefined
              for (const step of script(prompt, turn)) {
                if ("hang" in step) {
                  yield* Effect.never
                  continue
                }
                if ("text" in step) {
                  lastText = step.text
                  yield* emit({
                    type: "stream_event",
                    event: {
                      type: "content_block_delta",
                      index: 0,
                      delta: { type: "text_delta", text: step.text },
                    },
                    parent_tool_use_id: null,
                    ...base,
                  })
                  yield* assistant([{ type: "text", text: step.text }])
                  continue
                }
                const toolUseId = `toolu_fake_${runNumber}_${++toolCounter}`
                yield* assistant([
                  { type: "tool_use", id: toolUseId, name: step.tool, input: step.input },
                ])
                const decision = yield* decide(step, toolUseId)
                const result =
                  decision.behavior === "allow"
                    ? executeTool(options.cwd, step)
                    : { content: decision.message, isError: true }
                yield* emit({
                  type: "user",
                  message: {
                    role: "user",
                    content: [
                      {
                        type: "tool_result",
                        tool_use_id: toolUseId,
                        content: result.content,
                        is_error: result.isError,
                      },
                    ],
                  },
                  parent_tool_use_id: null,
                  ...base,
                })
              }
              yield* emit({
                type: "result",
                subtype: "success",
                is_error: false,
                result: lastText ?? "",
                duration_ms: 1,
                num_turns: 1,
                total_cost_usd: 0,
                usage: { input_tokens: 10, output_tokens: 5 },
                ...base,
              })
            }).pipe(Effect.onInterrupt(() => emitInterrupted))

          // Turns run one at a time, like the real SDK in streaming input mode.
          yield* Effect.gen(function* () {
            while (true) {
              const prompt = yield* Queue.take(prompts)
              if (interruptRequested) {
                interruptRequested = false
                turn++
                yield* emitInterrupted
              } else {
                const fiber = yield* Effect.forkChild(runTurn(prompt))
                yield* Ref.set(current, Option.some(fiber))
                yield* Fiber.await(fiber)
                yield* Ref.set(current, Option.none())
              }
              pending--
            }
          }).pipe(Effect.forkScoped)

          return {
            messages: Stream.fromQueue(outbox),
            send: (text: string) =>
              Ref.update(log.prompts, (all) => [...all, text]).pipe(
                Effect.tap(() => Effect.sync(() => pending++)),
                Effect.andThen(Queue.offer(prompts, text)),
                Effect.asVoid,
              ),
            interrupt: Ref.get(current).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () =>
                    Effect.sync(() => {
                      if (pending > 0) interruptRequested = true
                    }),
                  onSome: (fiber) => Fiber.interrupt(fiber),
                }),
              ),
            ),
          }
        })

      return AgentRunner.of({ start })
    }),
  ).pipe(
    Layer.provideMerge(
      Layer.effect(
        FakeAgentLog,
        Effect.gen(function* () {
          return FakeAgentLog.of({
            runs: yield* Ref.make<ReadonlyArray<AgentRunOptions>>([]),
            prompts: yield* Ref.make<ReadonlyArray<string>>([]),
            permissions: yield* Ref.make<ReadonlyArray<PermissionLogEntry>>([]),
          })
        }),
      ),
    ),
  )
