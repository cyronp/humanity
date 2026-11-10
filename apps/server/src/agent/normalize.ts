import type { AssistantBlock, MessageContent, ToolResult } from "@humanity/contracts"
import { Option, Schema } from "effect"

/**
 * Turns raw Agent SDK messages into Humanity's normalized shapes. Only the
 * fields Humanity uses are described; everything else in a message is
 * ignored here and preserved in the raw copy stored next to it.
 */

const InitMessage = Schema.Struct({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: Schema.String,
  model: Schema.String,
  tools: Schema.Array(Schema.String),
  skills: Schema.optional(Schema.Array(Schema.String)),
  mcp_servers: Schema.optional(
    Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String })),
  ),
})

const AssistantMessage = Schema.Struct({
  type: Schema.Literal("assistant"),
  message: Schema.Struct({ content: Schema.Array(Schema.Unknown) }),
  parent_tool_use_id: Schema.optional(Schema.NullOr(Schema.String)),
})

const UserMessage = Schema.Struct({
  type: Schema.Literal("user"),
  message: Schema.Struct({
    content: Schema.Union([Schema.String, Schema.Array(Schema.Unknown)]),
  }),
  parent_tool_use_id: Schema.optional(Schema.NullOr(Schema.String)),
  tool_use_result: Schema.optional(Schema.Unknown),
})

const Usage = Schema.Struct({
  input_tokens: Schema.optional(Schema.NullOr(Schema.Number)),
  output_tokens: Schema.optional(Schema.NullOr(Schema.Number)),
  cache_read_input_tokens: Schema.optional(Schema.NullOr(Schema.Number)),
  cache_creation_input_tokens: Schema.optional(Schema.NullOr(Schema.Number)),
})

const ResultMessage = Schema.Struct({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  is_error: Schema.optional(Schema.Boolean),
  result: Schema.optional(Schema.String),
  duration_ms: Schema.optional(Schema.Number),
  num_turns: Schema.optional(Schema.Number),
  total_cost_usd: Schema.optional(Schema.Number),
  usage: Schema.optional(Usage),
  errors: Schema.optional(Schema.Array(Schema.String)),
})

const TextDeltaEvent = Schema.Struct({
  type: Schema.Literal("stream_event"),
  parent_tool_use_id: Schema.optional(Schema.NullOr(Schema.String)),
  event: Schema.Struct({
    type: Schema.Literal("content_block_delta"),
    delta: Schema.Struct({ type: Schema.Literal("text_delta"), text: Schema.String }),
  }),
})

const AnyMessage = Schema.Struct({
  type: Schema.String,
  subtype: Schema.optional(Schema.String),
})

const TextContent = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const ThinkingContent = Schema.Struct({
  type: Schema.Literal("thinking"),
  thinking: Schema.String,
})
const ToolUseContent = Schema.Struct({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
})
const ToolResultContent = Schema.Struct({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  content: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.Unknown)])),
  is_error: Schema.optional(Schema.Boolean),
})
const TypedBlock = Schema.Struct({ type: Schema.String })

const decode =
  <S extends Schema.Constraint>(schema: S) =>
  (input: unknown): Option.Option<S["Type"]> =>
    Schema.decodeUnknownOption(schema as never)(input) as Option.Option<S["Type"]>

const decodeInit = decode(InitMessage)
const decodeAssistant = decode(AssistantMessage)
const decodeUser = decode(UserMessage)
const decodeResult = decode(ResultMessage)
const decodeDelta = decode(TextDeltaEvent)
const decodeAny = decode(AnyMessage)
const decodeText = decode(TextContent)
const decodeThinking = decode(ThinkingContent)
const decodeToolUse = decode(ToolUseContent)
const decodeToolResult = decode(ToolResultContent)
const decodeTyped = decode(TypedBlock)

/** What one raw SDK message means to Humanity. */
export type Normalized =
  | {
      readonly _tag: "Message"
      readonly content: MessageContent
      /** The SDK session id, when the message announces it (`system`/`init`). */
      readonly sdkSessionId?: string
      /** The tool's structured output (`tool_use_result`), for single-result messages. */
      readonly structuredResult?: unknown
    }
  /** A chunk of streamed assistant text. Shown live, never persisted. */
  | { readonly _tag: "TextDelta"; readonly text: string }
  /** Streaming noise with nothing to show or keep (other partial events). */
  | { readonly _tag: "Skip" }

const message = (content: MessageContent, extra: Partial<Normalized> = {}): Normalized =>
  ({ _tag: "Message", content, ...extra }) as Normalized

const assistantBlocks = (content: ReadonlyArray<unknown>): Array<AssistantBlock> =>
  content.flatMap((block): Array<AssistantBlock> => {
    const text = decodeText(block)
    if (Option.isSome(text)) return [{ _tag: "text", text: text.value.text }]
    const thinking = decodeThinking(block)
    if (Option.isSome(thinking)) return [{ _tag: "thinking", text: thinking.value.thinking }]
    const toolUse = decodeToolUse(block)
    if (Option.isSome(toolUse)) {
      return [
        {
          _tag: "tool_use",
          toolUseId: toolUse.value.id,
          toolName: toolUse.value.name,
          input: toolUse.value.input,
        },
      ]
    }
    return []
  })

/** Flattens a tool result's content to the text the model saw. */
export const toolResultText = (content: string | ReadonlyArray<unknown> | undefined): string => {
  if (content === undefined) return ""
  if (typeof content === "string") return content
  return content
    .map((block) => {
      const text = decodeText(block)
      if (Option.isSome(text)) return text.value.text
      const typed = decodeTyped(block)
      return Option.isSome(typed) ? `[${typed.value.type}]` : ""
    })
    .filter((part) => part !== "")
    .join("\n")
}

const toolResults = (content: ReadonlyArray<unknown>): Array<ToolResult> =>
  content.flatMap((block): Array<ToolResult> => {
    const result = decodeToolResult(block)
    if (Option.isNone(result)) return []
    return [
      {
        toolUseId: result.value.tool_use_id,
        content: toolResultText(result.value.content),
        isError: result.value.is_error === true,
      },
    ]
  })

export const normalizeSdkMessage = (raw: unknown): Normalized => {
  const delta = decodeDelta(raw)
  if (Option.isSome(delta)) {
    // Text streamed inside a subagent belongs to that tool call, not the chat.
    return (delta.value.parent_tool_use_id ?? null) === null
      ? { _tag: "TextDelta", text: delta.value.event.delta.text }
      : { _tag: "Skip" }
  }

  const init = decodeInit(raw)
  if (Option.isSome(init)) {
    return message(
      {
        _tag: "system_init",
        model: init.value.model,
        tools: init.value.tools,
        skills: init.value.skills ?? [],
        mcpServers: init.value.mcp_servers ?? [],
      },
      { sdkSessionId: init.value.session_id },
    )
  }

  const assistant = decodeAssistant(raw)
  if (Option.isSome(assistant)) {
    return message({
      _tag: "assistant",
      blocks: assistantBlocks(assistant.value.message.content),
      parentToolUseId: assistant.value.parent_tool_use_id ?? null,
    })
  }

  const user = decodeUser(raw)
  if (Option.isSome(user)) {
    const content = user.value.message.content
    const results = typeof content === "string" ? [] : toolResults(content)
    if (results.length === 0) {
      // Echoes of prompts Humanity sent itself, or synthetic context: nothing new to show.
      return message({ _tag: "other", type: "user", subtype: null })
    }
    return message(
      {
        _tag: "tool_results",
        results,
        parentToolUseId: user.value.parent_tool_use_id ?? null,
      },
      results.length === 1 && user.value.tool_use_result !== undefined
        ? { structuredResult: user.value.tool_use_result }
        : {},
    )
  }

  const result = decodeResult(raw)
  if (Option.isSome(result)) {
    const value = result.value
    const usage = value.usage
    return message({
      _tag: "result",
      subtype: value.subtype,
      isError: value.is_error === true || value.subtype !== "success",
      text:
        value.result ?? (value.errors && value.errors.length > 0 ? value.errors.join("\n") : null),
      durationMs: value.duration_ms ?? 0,
      numTurns: value.num_turns ?? 0,
      costUsd: value.total_cost_usd ?? 0,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
      },
    })
  }

  const any = decodeAny(raw)
  if (Option.isSome(any)) {
    if (any.value.type === "stream_event") return { _tag: "Skip" }
    return message({ _tag: "other", type: any.value.type, subtype: any.value.subtype ?? null })
  }
  return message({ _tag: "other", type: "unknown", subtype: null })
}
