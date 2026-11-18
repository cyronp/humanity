import { PATCH_TOOL, SHELL_TOOL } from "@humanity/contracts"
import { Option, Schema } from "effect"
import {
  AgentMessageDelta,
  decode,
  ItemNotification,
  type ThreadItem,
  TurnCompleted,
} from "../codex/protocol.ts"
import { type Normalized, toolResultText } from "./normalize.ts"


export const CODEX_READY = "humanity/ready"

export interface CodexTurnUsage {
  readonly inputTokens: number
  readonly cachedInputTokens: number
  readonly cacheWriteInputTokens: number
  readonly outputTokens: number
}

export interface CodexEvent {
  readonly type: "codex"
  readonly method: string
  readonly params: unknown
  readonly usage?: CodexTurnUsage
}

export const codexEvent = (method: string, params: unknown, usage?: CodexTurnUsage): CodexEvent =>
  usage === undefined ? { type: "codex", method, params } : { type: "codex", method, params, usage }

const Event = Schema.Struct({
  type: Schema.Literal("codex"),
  method: Schema.String,
  params: Schema.Unknown,
  usage: Schema.optional(
    Schema.Struct({
      inputTokens: Schema.Number,
      cachedInputTokens: Schema.Number,
      cacheWriteInputTokens: Schema.Number,
      outputTokens: Schema.Number,
    }),
  ),
})
const Ready = Schema.Struct({ threadId: Schema.String, model: Schema.String })

const decodeEvent = decode(Event)
const decodeReady = decode(Ready)
const decodeItem = decode(ItemNotification)
const decodeDelta = decode(AgentMessageDelta)
const decodeTurn = decode(TurnCompleted)

export interface PatchFile {
  readonly path: string
  readonly kind: "add" | "delete" | "update"
  readonly movePath?: string
  readonly diff: string
}

export const patchInput = (
  changes: NonNullable<ThreadItem["changes"]>,
): { readonly changes: ReadonlyArray<PatchFile> } => ({
  changes: changes.map((change) => ({
    path: change.path,
    kind: change.kind.type === "add" || change.kind.type === "delete" ? change.kind.type : "update",
    ...(typeof change.kind.move_path === "string" ? { movePath: change.kind.move_path } : {}),
    diff: change.diff,
  })),
})

export const codexToolCall = (
  item: ThreadItem,
): { readonly toolName: string; readonly input: Record<string, unknown> } | undefined => {
  switch (item.type) {
    case "commandExecution":
      return {
        toolName: SHELL_TOOL,
        input: {
          command: item.command ?? "",
          ...(item.cwd === undefined ? {} : { cwd: item.cwd }),
        },
      }
    case "fileChange":
      return { toolName: PATCH_TOOL, input: patchInput(item.changes ?? []) }
    case "mcpToolCall":
      return {
        toolName: `mcp__${item.server ?? "unknown"}__${item.tool ?? "unknown"}`,
        input:
          typeof item.arguments === "object" && item.arguments !== null
            ? (item.arguments as Record<string, unknown>)
            : {},
      }
    case "webSearch":
      return { toolName: "WebSearch", input: { query: item.query ?? "" } }
    default:
      return undefined
  }
}

const filesChanged = (item: ThreadItem): string => {
  const count = item.changes?.length ?? 0
  return count === 1 ? "1 file" : `${count} files`
}

const toolResult = (item: ThreadItem): { readonly content: string; readonly isError: boolean } => {
  switch (item.type) {
    case "commandExecution":
      if (item.status === "declined") return { content: "The command was not run.", isError: true }
      return {
        content: item.aggregatedOutput ?? "",
        isError: item.status !== "completed" || (item.exitCode ?? 0) !== 0,
      }
    case "fileChange":
      return item.status === "completed"
        ? { content: `Applied the patch to ${filesChanged(item)}.`, isError: false }
        : {
            content:
              item.status === "declined"
                ? "The patch was not applied."
                : "The patch could not be applied.",
            isError: true,
          }
    case "mcpToolCall": {
      const failed = item.error !== null && item.error !== undefined
      return {
        content: failed ? item.error.message : toolResultText(item.result?.content),
        isError: failed || item.status !== "completed",
      }
    }
    default:
      return { content: "", isError: item.status === "failed" }
  }
}

const skip: Normalized = { _tag: "Skip" }

export const normalizeCodexEvent = (raw: unknown): Normalized => {
  const event = decodeEvent(raw)
  if (Option.isNone(event)) {
    return { _tag: "Message", content: { _tag: "other", type: "unknown", subtype: null } }
  }
  const { method, params, usage } = event.value

  switch (method) {
    case CODEX_READY: {
      const ready = decodeReady(params)
      if (Option.isNone(ready)) return skip
      return {
        _tag: "Message",
        content: {
          _tag: "system_init",
          model: ready.value.model,
          tools: [],
          skills: [],
          mcpServers: [],
        },
        sdkSessionId: ready.value.threadId,
      }
    }
    case "item/agentMessage/delta": {
      const delta = decodeDelta(params)
      return Option.isSome(delta) ? { _tag: "TextDelta", text: delta.value.delta } : skip
    }
    case "item/started": {
      const started = decodeItem(params)
      if (Option.isNone(started)) return skip
      const call = codexToolCall(started.value.item)
      if (call === undefined) return skip
      return {
        _tag: "Message",
        content: {
          _tag: "assistant",
          blocks: [{ _tag: "tool_use", toolUseId: started.value.item.id, ...call }],
          parentToolUseId: null,
        },
      }
    }
    case "item/completed": {
      const completed = decodeItem(params)
      if (Option.isNone(completed)) return skip
      const { item } = completed.value
      if (item.type === "agentMessage") {
        const text = item.text ?? ""
        if (text === "") return skip
        return {
          _tag: "Message",
          content: { _tag: "assistant", blocks: [{ _tag: "text", text }], parentToolUseId: null },
        }
      }
      if (item.type === "reasoning") {
        const text = (item.summary ?? []).join("\n\n").trim()
        if (text === "") return skip
        return {
          _tag: "Message",
          content: {
            _tag: "assistant",
            blocks: [{ _tag: "thinking", text }],
            parentToolUseId: null,
          },
        }
      }
      if (codexToolCall(item) === undefined) return skip
      return {
        _tag: "Message",
        content: {
          _tag: "tool_results",
          results: [{ toolUseId: item.id, ...toolResult(item) }],
          parentToolUseId: null,
        },
      }
    }
    case "turn/completed": {
      const completed = decodeTurn(params)
      if (Option.isNone(completed)) return skip
      const { turn } = completed.value
      const cached = usage?.cachedInputTokens ?? 0
      return {
        _tag: "Message",
        content: {
          _tag: "result",
          subtype: turn.status === "completed" ? "success" : turn.status,
          isError: turn.status === "failed",
          text: turn.error?.message ?? null,
          durationMs: turn.durationMs ?? 0,
          numTurns: 1,
          costUsd: 0,
          usage: {
            inputTokens: Math.max(0, (usage?.inputTokens ?? 0) - cached),
            outputTokens: usage?.outputTokens ?? 0,
            cacheReadTokens: cached,
            cacheCreationTokens: usage?.cacheWriteInputTokens ?? 0,
          },
        },
      }
    }
    default:
      return skip
  }
}
