import { describe, expect, it } from "vitest"
import { CODEX_READY, codexEvent, normalizeCodexEvent } from "../src/agent/normalizeCodex.ts"

const scope = { threadId: "t1", turnId: "turn1" }
const started = (item: Record<string, unknown>) =>
  normalizeCodexEvent(codexEvent("item/started", { item, ...scope }))
const completed = (item: Record<string, unknown>) =>
  normalizeCodexEvent(codexEvent("item/completed", { item, ...scope }))

describe("normalizeCodexEvent", () => {
  it("reads the thread a run opened, to resume it later", () => {
    expect(
      normalizeCodexEvent(codexEvent(CODEX_READY, { threadId: "t1", model: "gpt-test" })),
    ).toEqual({
      _tag: "Message",
      sdkSessionId: "t1",
      content: { _tag: "system_init", model: "gpt-test", tools: [], skills: [], mcpServers: [] },
    })
  })

  it("streams the agent's text and keeps the finished message", () => {
    expect(
      normalizeCodexEvent(codexEvent("item/agentMessage/delta", { ...scope, delta: "Hel" })),
    ).toEqual({ _tag: "TextDelta", text: "Hel" })
    expect(completed({ type: "agentMessage", id: "m1", text: "Hello" })).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        blocks: [{ _tag: "text", text: "Hello" }],
        parentToolUseId: null,
      },
    })
  })

  it("shows a reasoning summary as thinking, and nothing for an empty one", () => {
    expect(completed({ type: "reasoning", id: "r1", summary: ["First", "Then"] })).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        blocks: [{ _tag: "thinking", text: "First\n\nThen" }],
        parentToolUseId: null,
      },
    })
    expect(completed({ type: "reasoning", id: "r2", summary: [] })).toEqual({ _tag: "Skip" })
  })

  it("turns a command into a shell tool call and its result", () => {
    const item = { type: "commandExecution", id: "c1", command: "npm test", cwd: "/repo" }
    expect(started({ ...item, status: "inProgress" })).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        blocks: [
          {
            _tag: "tool_use",
            toolUseId: "c1",
            toolName: "Bash",
            input: { command: "npm test", cwd: "/repo" },
          },
        ],
        parentToolUseId: null,
      },
    })
    expect(
      completed({ ...item, status: "completed", aggregatedOutput: "1 failed", exitCode: 1 }),
    ).toEqual({
      _tag: "Message",
      content: {
        _tag: "tool_results",
        results: [{ toolUseId: "c1", content: "1 failed", isError: true }],
        parentToolUseId: null,
      },
    })
  })

  it("says a declined command was not run", () => {
    const result = completed({
      type: "commandExecution",
      id: "c2",
      command: "rm -rf build",
      status: "declined",
      aggregatedOutput: null,
      exitCode: null,
    })
    expect(result).toMatchObject({
      content: { results: [{ content: "The command was not run.", isError: true }] },
    })
  })

  it("turns a file change into a patch tool call with every file's diff", () => {
    expect(
      started({
        type: "fileChange",
        id: "p1",
        status: "inProgress",
        changes: [
          { path: "/repo/new.txt", kind: { type: "add" }, diff: "hi\n" },
          {
            path: "/repo/a.ts",
            kind: { type: "update", move_path: "/repo/b.ts" },
            diff: "@@ -1 +1 @@\n-a\n+b\n",
          },
        ],
      }),
    ).toMatchObject({
      content: {
        blocks: [
          {
            toolName: "ApplyPatch",
            input: {
              changes: [
                { path: "/repo/new.txt", kind: "add", diff: "hi\n" },
                {
                  path: "/repo/a.ts",
                  kind: "update",
                  movePath: "/repo/b.ts",
                  diff: "@@ -1 +1 @@\n-a\n+b\n",
                },
              ],
            },
          },
        ],
      },
    })
    expect(
      completed({ type: "fileChange", id: "p1", status: "declined", changes: [] }),
    ).toMatchObject({ content: { results: [{ toolUseId: "p1", isError: true }] } })
  })

  it("names an MCP tool like Claude Code does and reads its result", () => {
    const item = { type: "mcpToolCall", id: "x1", server: "github", tool: "list_issues" }
    expect(started({ ...item, status: "inProgress", arguments: { repo: "a/b" } })).toMatchObject({
      content: { blocks: [{ toolName: "mcp__github__list_issues", input: { repo: "a/b" } }] },
    })
    expect(
      completed({
        ...item,
        status: "completed",
        arguments: {},
        result: { content: [{ type: "text", text: "3 issues" }] },
        error: null,
      }),
    ).toMatchObject({ content: { results: [{ content: "3 issues", isError: false }] } })
    expect(
      completed({ ...item, status: "failed", arguments: {}, error: { message: "no token" } }),
    ).toMatchObject({ content: { results: [{ content: "no token", isError: true }] } })
  })

  it("ends a turn with what it used, cached tokens apart", () => {
    expect(
      normalizeCodexEvent(
        codexEvent(
          "turn/completed",
          { threadId: "t1", turn: { id: "turn1", status: "completed", durationMs: 1200 } },
          { inputTokens: 1000, cachedInputTokens: 800, cacheWriteInputTokens: 0, outputTokens: 50 },
        ),
      ),
    ).toEqual({
      _tag: "Message",
      content: {
        _tag: "result",
        subtype: "success",
        isError: false,
        text: null,
        durationMs: 1200,
        numTurns: 1,
        costUsd: 0,
        usage: { inputTokens: 200, outputTokens: 50, cacheReadTokens: 800, cacheCreationTokens: 0 },
      },
    })
  })

  it("reports a failed turn with Codex's reason, and an interrupted one without an error", () => {
    const turn = (status: string, error: unknown) =>
      normalizeCodexEvent(codexEvent("turn/completed", { turn: { id: "t", status, error } }))
    expect(turn("failed", { message: "model not supported" })).toMatchObject({
      content: { subtype: "failed", isError: true, text: "model not supported" },
    })
    expect(turn("interrupted", null)).toMatchObject({
      content: { subtype: "interrupted", isError: false },
    })
  })

  it("skips what Humanity does not show", () => {
    expect(started({ type: "userMessage", id: "u1" })).toEqual({ _tag: "Skip" })
    expect(normalizeCodexEvent(codexEvent("thread/status/changed", {}))).toEqual({ _tag: "Skip" })
  })
})
