import { PATCH_TOOL, SHELL_TOOL } from "@humanity/contracts"
import { computeHunks, hunkHeader } from "@humanity/diff"
import { Option, Schema } from "effect"
import { decode, type ToolCallFields } from "../acp/protocol.ts"
import type { Normalized } from "./normalize.ts"
import type { PatchFile } from "./normalizeCodex.ts"

/**
 * Turns what an ACP run reports into Humanity's normalized shapes. The agent
 * streams a message in chunks and a tool call in updates; the run puts each
 * back together and hands on whole things, as `AcpEvent`s.
 */

/** The session exists and can be reopened by this id. */
export const ACP_READY = "humanity/ready"
/** A chunk of the answer, as it is written. */
export const ACP_TEXT_DELTA = "message/delta"
/** The answer so far, whole, once something else follows it. */
export const ACP_TEXT = "message"
export const ACP_THOUGHT = "thought"
export const ACP_TOOL_STARTED = "tool/started"
export const ACP_TOOL_COMPLETED = "tool/completed"
export const ACP_TURN_COMPLETED = "turn/completed"

export interface AcpEvent {
  readonly type: "acp"
  readonly method: string
  readonly params: unknown
}

export const acpEvent = (method: string, params: unknown): AcpEvent => ({
  type: "acp",
  method,
  params,
})

/** A tool call under the name Humanity knows the tool by, with its input. */
export interface NamedTool {
  readonly toolName: string
  readonly input: Record<string, unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringOf = (record: Record<string, unknown>, keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value !== "") return value
  }
  return undefined
}

/** A change from one text to another as bare `@@` hunks, the way a patch carries it. */
const hunksText = (before: string, after: string): string =>
  computeHunks(before, after)
    .map((hunk) => [hunkHeader(hunk), ...hunk.lines].join("\n"))
    .join("\n")

/** The files a tool call changes, from the diffs it shows; empty when it shows none. */
export const acpPatchFiles = (call: ToolCallFields): Array<PatchFile> => {
  const files: Array<PatchFile> = []
  for (const part of call.content ?? []) {
    if (part.type !== "diff" || typeof part.path !== "string" || part.path === "") continue
    const after = part.newText ?? ""
    const before = part.oldText
    files.push(
      before === null || before === undefined
        ? { path: part.path, kind: "add", diff: after }
        : call.kind === "delete" && after === ""
          ? { path: part.path, kind: "delete", diff: before }
          : { path: part.path, kind: "update", diff: hunksText(before, after) },
    )
  }
  return files
}

/**
 * What an ACP tool call is to Humanity, read from the kind the agent gives
 * it. A command is `Bash` and a file change that shows its diffs is
 * `ApplyPatch`, so both are decided like any other agent's. A call Humanity
 * cannot place keeps the agent's own name for it, which no thread pre-approves.
 */
export const acpToolCall = (call: ToolCallFields): NamedTool => {
  const raw = isRecord(call.rawInput) ? call.rawInput : {}
  const title = call.title ?? ""
  const path = call.locations?.[0]?.path
  switch (call.kind) {
    case "execute": {
      const cwd = stringOf(raw, ["cwd", "workdir", "working_directory"])
      const command = stringOf(raw, ["command", "cmd"]) ?? title
      return {
        toolName: SHELL_TOOL,
        input: {
          command,
          ...(cwd === undefined ? {} : { cwd }),
          ...(title === "" || title === command ? {} : { description: title }),
        },
      }
    }
    case "edit":
    case "delete":
    case "move": {
      const changes = acpPatchFiles(call)
      if (changes.length > 0) return { toolName: PATCH_TOOL, input: { changes } }
      break
    }
    case "read":
      if (path !== undefined) return { toolName: "Read", input: { file_path: path } }
      break
    case "search": {
      const pattern = stringOf(raw, ["pattern", "query", "regex"]) ?? title
      return { toolName: "Grep", input: { pattern, ...(path === undefined ? {} : { path }) } }
    }
    case "fetch": {
      const url = stringOf(raw, ["url", "uri"])
      if (url !== undefined) return { toolName: "WebFetch", input: { url } }
      break
    }
  }
  return {
    toolName: call.name ?? (title === "" ? "Tool" : title),
    input: {
      ...raw,
      ...(title === "" || call.name === null || call.name === undefined ? {} : { title }),
      ...(call.locations === null || call.locations === undefined || call.locations.length === 0
        ? {}
        : { paths: call.locations.map((location) => location.path) }),
    },
  }
}

/** What a finished tool call produced, as text. */
export const acpToolOutput = (call: ToolCallFields): string => {
  const parts: Array<string> = []
  for (const part of call.content ?? []) {
    if (part.type !== "content") continue
    const text = part.content?.text
    if (typeof text === "string" && text !== "") parts.push(text)
  }
  if (parts.length > 0) return parts.join("\n")
  if (typeof call.rawOutput === "string") return call.rawOutput
  if (call.rawOutput !== undefined && call.rawOutput !== null) {
    return JSON.stringify(call.rawOutput, null, 2)
  }
  return ""
}

const Event = Schema.Struct({
  type: Schema.Literal("acp"),
  method: Schema.String,
  params: Schema.Unknown,
})
const Ready = Schema.Struct({ sessionId: Schema.String, model: Schema.String })
const Text = Schema.Struct({ text: Schema.String })
const ToolStarted = Schema.Struct({
  toolCallId: Schema.String,
  toolName: Schema.String,
  input: Schema.Record(Schema.String, Schema.Unknown),
})
const ToolCompleted = Schema.Struct({
  toolCallId: Schema.String,
  content: Schema.String,
  isError: Schema.Boolean,
})
const TurnCompleted = Schema.Struct({
  /** Why the agent stopped: `end_turn`, `cancelled`, `max_tokens`, `refusal`, … */
  stopReason: Schema.String,
  /** Set when the turn could not run or broke off. */
  error: Schema.NullOr(Schema.String),
  durationMs: Schema.Number,
  usage: Schema.NullOr(
    Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      cachedReadTokens: Schema.Number,
      cachedWriteTokens: Schema.Number,
    }),
  ),
})
export type AcpTurnCompleted = typeof TurnCompleted.Type

const decodeEvent = decode(Event)
const decodeReady = decode(Ready)
const decodeText = decode(Text)
const decodeToolStarted = decode(ToolStarted)
const decodeToolCompleted = decode(ToolCompleted)
const decodeTurn = decode(TurnCompleted)

const skip: Normalized = { _tag: "Skip" }

export const normalizeAcpEvent = (raw: unknown): Normalized => {
  const event = decodeEvent(raw)
  if (Option.isNone(event)) {
    return { _tag: "Message", content: { _tag: "other", type: "unknown", subtype: null } }
  }
  const { method, params } = event.value

  switch (method) {
    case ACP_READY: {
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
        sdkSessionId: ready.value.sessionId,
      }
    }
    case ACP_TEXT_DELTA: {
      const delta = decodeText(params)
      return Option.isSome(delta) ? { _tag: "TextDelta", text: delta.value.text } : skip
    }
    case ACP_TEXT:
    case ACP_THOUGHT: {
      const said = decodeText(params)
      if (Option.isNone(said) || said.value.text.trim() === "") return skip
      const { text } = said.value
      return {
        _tag: "Message",
        content: {
          _tag: "assistant",
          blocks: [method === ACP_TEXT ? { _tag: "text", text } : { _tag: "thinking", text }],
          parentToolUseId: null,
        },
      }
    }
    case ACP_TOOL_STARTED: {
      const started = decodeToolStarted(params)
      if (Option.isNone(started)) return skip
      const { toolCallId, toolName, input } = started.value
      return {
        _tag: "Message",
        content: {
          _tag: "assistant",
          blocks: [{ _tag: "tool_use", toolUseId: toolCallId, toolName, input }],
          parentToolUseId: null,
        },
      }
    }
    case ACP_TOOL_COMPLETED: {
      const completed = decodeToolCompleted(params)
      if (Option.isNone(completed)) return skip
      const { toolCallId, content, isError } = completed.value
      return {
        _tag: "Message",
        content: {
          _tag: "tool_results",
          results: [{ toolUseId: toolCallId, content, isError }],
          parentToolUseId: null,
        },
      }
    }
    case ACP_TURN_COMPLETED: {
      const completed = decodeTurn(params)
      if (Option.isNone(completed)) return skip
      const { stopReason, error, durationMs, usage } = completed.value
      const failed = error !== null
      return {
        _tag: "Message",
        content: {
          _tag: "result",
          subtype: failed ? "failed" : stopReason === "end_turn" ? "success" : stopReason,
          isError: failed || (stopReason !== "end_turn" && stopReason !== "cancelled"),
          text: error,
          durationMs,
          numTurns: 1,
          costUsd: 0,
          usage: {
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            cacheReadTokens: usage?.cachedReadTokens ?? 0,
            cacheCreationTokens: usage?.cachedWriteTokens ?? 0,
          },
        },
      }
    }
    default:
      return skip
  }
}
