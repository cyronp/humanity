import { describe, expect, it } from "vitest"
import { normalizeSdkMessage, toolResultText } from "../src/agent/normalize.ts"

const base = { uuid: "u", session_id: "s" }

describe("normalizeSdkMessage", () => {
  it("reads the init message and its session id", () => {
    expect(
      normalizeSdkMessage({
        type: "system",
        subtype: "init",
        model: "claude-opus-5-5",
        tools: ["Read", "Edit"],
        mcp_servers: [{ name: "github", status: "connected", source: "project" }],
        cwd: "/tmp/x",
        permissionMode: "default",
        ...base,
      }),
    ).toEqual({
      _tag: "Message",
      sdkSessionId: "s",
      content: {
        _tag: "system_init",
        model: "claude-opus-5-5",
        tools: ["Read", "Edit"],
        skills: [],
        mcpServers: [{ name: "github", status: "connected" }],
      },
    })
  })

  it("keeps text, thinking and tool_use blocks and drops the rest", () => {
    const normalized = normalizeSdkMessage({
      type: "assistant",
      message: {
        id: "msg_1",
        content: [
          { type: "thinking", thinking: "Let me look.", signature: "sig" },
          { type: "redacted_thinking", data: "xxx" },
          { type: "text", text: "Reading the file." },
          { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/a.ts" } },
        ],
      },
      parent_tool_use_id: null,
      ...base,
    })
    expect(normalized).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        parentToolUseId: null,
        blocks: [
          { _tag: "thinking", text: "Let me look." },
          { _tag: "text", text: "Reading the file." },
          {
            _tag: "tool_use",
            toolUseId: "toolu_1",
            toolName: "Read",
            input: { file_path: "/a.ts" },
          },
        ],
      },
    })
  })

  it("turns tool results into text and keeps the structured output", () => {
    const normalized = normalizeSdkMessage({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [
              { type: "text", text: "line 1" },
              { type: "image", source: {} },
            ],
            is_error: false,
          },
        ],
      },
      parent_tool_use_id: null,
      tool_use_result: { stdout: "line 1", stderr: "" },
      ...base,
    })
    expect(normalized).toEqual({
      _tag: "Message",
      structuredResult: { stdout: "line 1", stderr: "" },
      content: {
        _tag: "tool_results",
        parentToolUseId: null,
        results: [{ toolUseId: "toolu_1", content: "line 1\n[image]", isError: false }],
      },
    })
  })

  it("treats echoed prompts as nothing new", () => {
    expect(
      normalizeSdkMessage({
        type: "user",
        message: { role: "user", content: "hello" },
        parent_tool_use_id: null,
      }),
    ).toEqual({ _tag: "Message", content: { _tag: "other", type: "user", subtype: null } })
  })

  it("summarizes the result of a turn, including failures", () => {
    const success = normalizeSdkMessage({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Done.",
      duration_ms: 1200,
      num_turns: 3,
      total_cost_usd: 0.0123,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: null,
      },
      ...base,
    })
    expect(success).toEqual({
      _tag: "Message",
      content: {
        _tag: "result",
        subtype: "success",
        isError: false,
        text: "Done.",
        durationMs: 1200,
        numTurns: 3,
        costUsd: 0.0123,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 0 },
      },
    })

    const failure = normalizeSdkMessage({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      errors: ["Reached the maximum number of turns."],
      ...base,
    })
    expect(failure).toMatchObject({
      content: { _tag: "result", isError: true, text: "Reached the maximum number of turns." },
    })
  })

  it("streams top-level text deltas and skips other partial events", () => {
    const delta = (parent: string | null) => ({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
      parent_tool_use_id: parent,
      ...base,
    })
    expect(normalizeSdkMessage(delta(null))).toEqual({ _tag: "TextDelta", text: "Hi" })
    expect(normalizeSdkMessage(delta("toolu_9"))).toEqual({ _tag: "Skip" })
    expect(
      normalizeSdkMessage({ type: "stream_event", event: { type: "message_stop" }, ...base }),
    ).toEqual({ _tag: "Skip" })
  })

  it("keeps unknown messages as `other` instead of dropping them", () => {
    expect(normalizeSdkMessage({ type: "rate_limit_event", ...base })).toEqual({
      _tag: "Message",
      content: { _tag: "other", type: "rate_limit_event", subtype: null },
    })
    expect(normalizeSdkMessage("garbage")).toEqual({
      _tag: "Message",
      content: { _tag: "other", type: "unknown", subtype: null },
    })
  })
})

describe("toolResultText", () => {
  it("handles strings, missing content and block arrays", () => {
    expect(toolResultText("plain")).toBe("plain")
    expect(toolResultText(undefined)).toBe("")
    expect(toolResultText([{ type: "text", text: "a" }, { type: "document" }])).toBe(
      "a\n[document]",
    )
  })
})
