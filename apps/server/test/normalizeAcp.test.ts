import { parseUnifiedDiff } from "@humanity/diff"
import { describe, expect, it } from "vitest"
import type { ToolCallFields } from "../src/acp/protocol.ts"
import {
  ACP_READY,
  ACP_TEXT,
  ACP_TEXT_DELTA,
  ACP_THOUGHT,
  ACP_TOOL_COMPLETED,
  ACP_TOOL_STARTED,
  ACP_TURN_COMPLETED,
  acpEvent,
  acpPatchFiles,
  acpToolCall,
  acpToolOutput,
  normalizeAcpEvent,
} from "../src/agent/normalizeAcp.ts"

const call = (fields: Partial<ToolCallFields>): ToolCallFields => ({ toolCallId: "t1", ...fields })

describe("acpToolCall", () => {
  it("names a command Bash, with the command the agent gave", () => {
    expect(
      acpToolCall(
        call({
          kind: "execute",
          title: "Run the tests",
          rawInput: { command: "npm test", cwd: "/w" },
        }),
      ),
    ).toEqual({
      toolName: "Bash",
      input: { command: "npm test", cwd: "/w", description: "Run the tests" },
    })
    // Without a raw input the title is all there is to show.
    expect(acpToolCall(call({ kind: "execute", title: "npm test" }))).toEqual({
      toolName: "Bash",
      input: { command: "npm test" },
    })
  })

  it("names a file change that shows its diffs ApplyPatch", () => {
    const named = acpToolCall(
      call({
        kind: "edit",
        title: "Edit files",
        content: [
          { type: "diff", path: "/w/a.ts", oldText: "one\ntwo\n", newText: "one\n2\n" },
          { type: "diff", path: "/w/new.ts", oldText: null, newText: "fresh\n" },
        ],
      }),
    )
    expect(named.toolName).toBe("ApplyPatch")
    expect(named.input).toEqual({
      changes: [
        { path: "/w/a.ts", kind: "update", diff: "@@ -1,2 +1,2 @@\n one\n-two\n+2" },
        { path: "/w/new.ts", kind: "add", diff: "fresh\n" },
      ],
    })
  })

  it("writes a change as hunks the patch view can read back", () => {
    const [file] = acpPatchFiles(
      call({
        kind: "edit",
        content: [{ type: "diff", path: "a.ts", oldText: "a\nb\nc\n", newText: "a\nB\nc\nd\n" }],
      }),
    )
    const parsed = parseUnifiedDiff(`--- a/a.ts\n+++ b/a.ts\n${file?.diff ?? ""}`)
    expect(parsed[0]?.hunks[0]?.lines).toEqual([" a", "-b", "+B", " c", "+d"])
  })

  it("names a deleted file's diff a deletion", () => {
    expect(
      acpPatchFiles(
        call({
          kind: "delete",
          content: [{ type: "diff", path: "old.ts", oldText: "x\n", newText: "" }],
        }),
      ),
    ).toEqual([{ path: "old.ts", kind: "delete", diff: "x\n" }])
  })

  it("names reads and searches as the tools no thread asks about", () => {
    expect(
      acpToolCall(call({ kind: "read", title: "Read a.ts", locations: [{ path: "/w/a.ts" }] })),
    ).toEqual({ toolName: "Read", input: { file_path: "/w/a.ts" } })
    expect(
      acpToolCall(call({ kind: "search", title: "TODO", rawInput: { pattern: "TODO" } })),
    ).toEqual({
      toolName: "Grep",
      input: { pattern: "TODO" },
    })
  })

  it("keeps the agent's own name for a call it cannot place", () => {
    // A file change that shows no diff is not something a thread can accept unseen.
    expect(
      acpToolCall(call({ kind: "edit", title: "Rewrite a.ts", locations: [{ path: "/w/a.ts" }] })),
    ).toEqual({ toolName: "Rewrite a.ts", input: { paths: ["/w/a.ts"] } })
    expect(
      acpToolCall(
        call({ kind: "other", name: "deploy", title: "Deploy to prod", rawInput: { env: "prod" } }),
      ),
    ).toEqual({ toolName: "deploy", input: { env: "prod", title: "Deploy to prod" } })
    expect(acpToolCall(call({}))).toEqual({ toolName: "Tool", input: {} })
  })
})

describe("acpToolOutput", () => {
  it("reads the text the tool produced, else its raw output", () => {
    expect(
      acpToolOutput(
        call({
          content: [
            { type: "content", content: { type: "text", text: "one" } },
            { type: "diff", path: "a.ts", newText: "x" },
            { type: "content", content: { type: "text", text: "two" } },
          ],
        }),
      ),
    ).toBe("one\ntwo")
    expect(acpToolOutput(call({ rawOutput: "done" }))).toBe("done")
    expect(acpToolOutput(call({ rawOutput: { code: 0 } }))).toBe('{\n  "code": 0\n}')
    expect(acpToolOutput(call({}))).toBe("")
  })
})

describe("normalizeAcpEvent", () => {
  it("announces the session with the id it is reopened by", () => {
    expect(normalizeAcpEvent(acpEvent(ACP_READY, { sessionId: "s1", model: "auto" }))).toEqual({
      _tag: "Message",
      content: { _tag: "system_init", model: "auto", tools: [], skills: [], mcpServers: [] },
      sdkSessionId: "s1",
    })
  })

  it("streams a chunk and keeps the whole answer and thought", () => {
    expect(normalizeAcpEvent(acpEvent(ACP_TEXT_DELTA, { text: "Hi" }))).toEqual({
      _tag: "TextDelta",
      text: "Hi",
    })
    expect(normalizeAcpEvent(acpEvent(ACP_TEXT, { text: "Hi there" }))).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        blocks: [{ _tag: "text", text: "Hi there" }],
        parentToolUseId: null,
      },
    })
    expect(normalizeAcpEvent(acpEvent(ACP_THOUGHT, { text: "Hmm" }))).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        blocks: [{ _tag: "thinking", text: "Hmm" }],
        parentToolUseId: null,
      },
    })
    expect(normalizeAcpEvent(acpEvent(ACP_TEXT, { text: "  " }))).toEqual({ _tag: "Skip" })
  })

  it("turns a tool call into its use and its result", () => {
    expect(
      normalizeAcpEvent(
        acpEvent(ACP_TOOL_STARTED, {
          toolCallId: "t1",
          toolName: "Bash",
          input: { command: "ls" },
          call: { toolCallId: "t1" },
        }),
      ),
    ).toEqual({
      _tag: "Message",
      content: {
        _tag: "assistant",
        blocks: [{ _tag: "tool_use", toolUseId: "t1", toolName: "Bash", input: { command: "ls" } }],
        parentToolUseId: null,
      },
    })
    expect(
      normalizeAcpEvent(
        acpEvent(ACP_TOOL_COMPLETED, { toolCallId: "t1", content: "a.ts", isError: false }),
      ),
    ).toEqual({
      _tag: "Message",
      content: {
        _tag: "tool_results",
        results: [{ toolUseId: "t1", content: "a.ts", isError: false }],
        parentToolUseId: null,
      },
    })
  })

  it("ends a turn with what it used and how it went", () => {
    const turn = (stopReason: string, error: string | null = null) =>
      normalizeAcpEvent(
        acpEvent(ACP_TURN_COMPLETED, {
          stopReason,
          error,
          durationMs: 40,
          usage: { inputTokens: 20, outputTokens: 10, cachedReadTokens: 5, cachedWriteTokens: 1 },
        }),
      )
    expect(turn("end_turn")).toEqual({
      _tag: "Message",
      content: {
        _tag: "result",
        subtype: "success",
        isError: false,
        text: null,
        durationMs: 40,
        numTurns: 1,
        costUsd: 0,
        usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 5, cacheCreationTokens: 1 },
      },
    })
    expect(turn("cancelled")).toMatchObject({ content: { subtype: "cancelled", isError: false } })
    expect(turn("max_tokens")).toMatchObject({ content: { subtype: "max_tokens", isError: true } })
    expect(turn("failed", "No model.")).toMatchObject({
      content: { subtype: "failed", isError: true, text: "No model." },
    })
  })

  it("skips what it does not know and marks what is not an event", () => {
    expect(normalizeAcpEvent(acpEvent("something/else", {}))).toEqual({ _tag: "Skip" })
    expect(normalizeAcpEvent({ type: "codex" })).toEqual({
      _tag: "Message",
      content: { _tag: "other", type: "unknown", subtype: null },
    })
  })
})
