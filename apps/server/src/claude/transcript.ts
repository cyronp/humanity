import type { ChatMessage, MessageContent, SessionId, ToolCall } from "@humanity/contracts"
import { Option, Schema } from "effect"
import { normalizeSdkMessage } from "../agent/normalize.ts"

/**
 * Turns a Claude Code transcript, as the Agent SDK's `getSessionMessages`
 * returns it, into a Humanity thread's messages and tool calls. Pure: the
 * caller stores the result.
 */

const TranscriptEntry = Schema.Struct({
  type: Schema.String,
  timestamp: Schema.optional(Schema.String),
  /** A slash command Claude Code ran itself (`/model`, `/login`): never part of the conversation. */
  isCompletedLocalCommand: Schema.optional(Schema.Boolean),
  isMeta: Schema.optional(Schema.Boolean),
  /**
   * Who wrote a user entry. Claude Code marks the human's own messages
   * `human`; others are its own (background task notifications, subagent
   * hand-backs). Older transcripts have no origin at all.
   */
  origin: Schema.optional(Schema.Struct({ kind: Schema.String })),
  message: Schema.optional(
    Schema.Struct({
      content: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.Unknown)])),
    }),
  ),
})

const Block = Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) })

const decodeEntry = Schema.decodeUnknownOption(TranscriptEntry)
const decodeBlock = Schema.decodeUnknownOption(Block)

/** Context Claude Code adds around what the human typed; none of it is theirs. */
const INJECTED_CONTEXT =
  /<(system-reminder|ide_opened_file|ide_selection|ide_diagnostics|local-command-caveat|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g

/** The human pasted this; the text is theirs, the wrapper is not. */
const PASTE_WRAPPER = /<\/?pasted_content(?:\s[^>]*)?>/g

const INTERRUPTION = /^\[Request interrupted by user[^\]]*\]$/

/** `<command-name>/review</command-name>…<command-args>42</command-args>` → `/review 42` */
const slashCommand = (text: string): string | undefined => {
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(text)?.[1]?.trim()
  if (name === undefined || name === "") return undefined
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim() ?? ""
  return args === "" ? name : `${name} ${args}`
}

/** What the human typed, without the context Claude Code wrapped around it. */
export const humanText = (text: string): string => {
  const command = slashCommand(text)
  if (command !== undefined) return command
  return text.replace(INJECTED_CONTEXT, "").replace(PASTE_WRAPPER, "").trim()
}

/** The human's words in a user entry, or `undefined` when it carries none. */
const userText = (content: string | ReadonlyArray<unknown>): string | undefined => {
  if (typeof content === "string") return humanText(content)
  const parts: Array<string> = []
  let images = 0
  for (const raw of content) {
    const block = decodeBlock(raw)
    if (Option.isNone(block)) continue
    if (block.value.type === "tool_result") return undefined
    if (block.value.type === "image") images += 1
    if (block.value.type === "text" && block.value.text !== undefined) {
      const text = humanText(block.value.text)
      if (text !== "") parts.push(text)
    }
  }
  if (images > 0) parts.push(images === 1 ? "[1 image]" : `[${images} images]`)
  return parts.join("\n\n")
}

export interface ImportedTranscript {
  readonly messages: ReadonlyArray<{ readonly message: ChatMessage; readonly raw: unknown }>
  readonly toolCalls: ReadonlyArray<ToolCall>
  /** Whether the human said anything: a transcript of only `/clear` or `/login` is not a conversation. */
  readonly hasConversation: boolean
}

export const importTranscript = (
  sessionId: SessionId,
  entries: ReadonlyArray<unknown>,
  /** When an entry carries no timestamp of its own. */
  fallbackTime: string,
): ImportedTranscript => {
  const messages: Array<{ message: ChatMessage; raw: unknown }> = []
  const toolCalls = new Map<string, ToolCall>()
  let hasConversation = false
  let time = fallbackTime

  const push = (content: MessageContent, raw: unknown) => {
    messages.push({
      message: { id: `${sessionId}:${messages.length}`, sessionId, content, createdAt: time },
      raw,
    })
  }

  for (const raw of entries) {
    const decoded = decodeEntry(raw)
    if (Option.isNone(decoded)) continue
    const entry = decoded.value
    if (entry.timestamp !== undefined && !Number.isNaN(Date.parse(entry.timestamp))) {
      time = new Date(entry.timestamp).toISOString()
    }
    if (entry.isCompletedLocalCommand === true || entry.isMeta === true) continue
    const content = entry.message?.content

    if (entry.type === "user" && content !== undefined) {
      const text = userText(content)
      // Written by Claude Code on the human's behalf, not by the human.
      if (text !== undefined && entry.origin !== undefined && entry.origin.kind !== "human") {
        continue
      }
      if (text !== undefined) {
        if (text === "") continue
        if (INTERRUPTION.test(text)) {
          push({ _tag: "notice", level: "warning", text: "Interrupted by the human." }, raw)
          continue
        }
        hasConversation = true
        push({ _tag: "user", text }, raw)
        continue
      }
    }

    if (entry.type !== "user" && entry.type !== "assistant") continue
    const normalized = normalizeSdkMessage(raw)
    if (normalized._tag !== "Message") continue
    const message = normalized.content

    if (message._tag === "assistant") {
      if (message.blocks.length === 0) continue
      for (const block of message.blocks) {
        if (block._tag !== "tool_use") continue
        toolCalls.set(block.toolUseId, {
          id: `${sessionId}:${block.toolUseId}`,
          sessionId,
          toolUseId: block.toolUseId,
          toolName: block.toolName,
          input: block.input,
          output: null,
          status: "running",
          startedAt: time,
          finishedAt: null,
        })
      }
      push(message, raw)
    } else if (message._tag === "tool_results") {
      for (const result of message.results) {
        const call = toolCalls.get(result.toolUseId)
        if (call === undefined) continue
        toolCalls.set(result.toolUseId, {
          ...call,
          output: result,
          status: result.isError ? "failed" : "succeeded",
          finishedAt: time,
        })
      }
      push(message, raw)
    }
  }

  return {
    messages,
    // A call the transcript never answered is not still running: Claude Code stopped first.
    toolCalls: [...toolCalls.values()].map((call) =>
      call.status === "running" ? { ...call, status: "failed" as const } : call,
    ),
    hasConversation,
  }
}
