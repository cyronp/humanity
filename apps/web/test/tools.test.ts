import { describe, expect, it } from "vitest"
import { parseAnsi, stripAnsi } from "@/features/tools/ansi"
import {
  bashOutput,
  describeInput,
  durationMs,
  formatDuration,
  parseReadOutput,
  readRange,
  resultLines,
  shortPath,
} from "@/features/tools/inputs"
import { findRenderer } from "@/features/tools/registry"
import { toolRenderers } from "@/features/tools/renderers"
import { OPEN_THREAD_TOOL, type ToolCall, SessionId } from "@humanity/contracts"

const ESC = "\u001b"

describe("parseAnsi", () => {
  it("keeps plain text as one segment", () => {
    expect(parseAnsi("hello")).toEqual([{ text: "hello" }])
    expect(parseAnsi("")).toEqual([])
  })

  it("turns colour and weight codes into styles and resets them", () => {
    const segments = parseAnsi(`${ESC}[1;31mFAIL${ESC}[0m src/a.test.ts ${ESC}[32m✓${ESC}[39m done`)
    expect(segments).toEqual([
      { text: "FAIL", bold: true, color: "text-red-600 dark:text-red-400" },
      { text: " src/a.test.ts " },
      { text: "✓", color: "text-emerald-600 dark:text-emerald-400" },
      { text: " done" },
    ])
  })

  it("drops cursor movements and skips extended colour parameters", () => {
    expect(parseAnsi(`${ESC}[2K${ESC}[1Gprogress`)).toEqual([{ text: "progress" }])
    expect(parseAnsi(`${ESC}[38;5;196mred${ESC}[0m`)).toEqual([{ text: "red" }])
    expect(parseAnsi(`${ESC}[38;2;255;0;0;1mbold${ESC}[0m`)).toEqual([{ text: "bold", bold: true }])
  })

  it("merges adjacent runs with the same style", () => {
    expect(parseAnsi(`${ESC}[33ma${ESC}[33mb`)).toEqual([
      { text: "ab", color: "text-amber-600 dark:text-amber-400" },
    ])
  })

  it("strips every escape sequence", () => {
    expect(stripAnsi(`${ESC}[1;31mFAIL${ESC}[0m ok${ESC}[2K`)).toBe("FAIL ok")
  })
})

describe("tool input helpers", () => {
  it("describes a call by its most telling input", () => {
    expect(describeInput({ command: "npm test", description: "Run tests" })).toBe("npm test")
    expect(describeInput({ file_path: "/w/a.ts" })).toBe("/w/a.ts")
    expect(describeInput({ other: "x" })).toBe("x")
    expect(describeInput(null)).toBe("")
  })

  it("shortens paths inside the worktree, on any platform", () => {
    expect(
      shortPath("/home/me/.humanity/worktrees/p/s/src/a.ts", "/home/me/.humanity/worktrees/p/s"),
    ).toBe("src/a.ts")
    expect(shortPath("C:\\Users\\me\\wt\\src\\a.ts", "C:\\Users\\me\\wt")).toBe("src/a.ts")
    expect(shortPath("/elsewhere/a.ts", "/home/me/wt")).toBe("/elsewhere/a.ts")
  })

  it("describes Read ranges", () => {
    expect(readRange({ file_path: "a" })).toBeUndefined()
    expect(readRange({ offset: 10, limit: 20 })).toBe("lines 10–29")
    expect(readRange({ offset: 5 })).toBe("from line 5")
  })

  it("strips the line-number gutter from Read output", () => {
    expect(parseReadOutput("    10→const a = 1\n    11→\n    12→export {}")).toEqual({
      firstLine: 10,
      lines: ["const a = 1", "", "export {}"],
    })
    expect(parseReadOutput("plain text")).toEqual({ firstLine: 1, lines: ["plain text"] })
  })

  it("lists search results without blank lines", () => {
    expect(resultLines("a.ts\r\n\nb.ts\n")).toEqual(["a.ts", "b.ts"])
  })

  it("reads Bash's structured output when present", () => {
    const call = (structuredOutput?: unknown): ToolCall => ({
      id: "1",
      sessionId: SessionId.make("s"),
      toolUseId: "t",
      toolName: "Bash",
      input: {},
      output: null,
      ...(structuredOutput === undefined ? {} : { structuredOutput }),
      status: "succeeded",
      startedAt: "2026-11-09T10:00:00.000Z",
      finishedAt: "2026-11-09T10:00:01.500Z",
    })
    expect(bashOutput(call({ stdout: "ok", stderr: "", interrupted: false }))).toEqual({
      stdout: "ok",
      stderr: "",
      interrupted: false,
    })
    expect(bashOutput(call())).toBeUndefined()
    expect(durationMs(call())).toBe(1500)
    expect(formatDuration(1500)).toBe("1.5 s")
    expect(formatDuration(42)).toBe("42 ms")
    expect(formatDuration(125_000)).toBe("2 min 5 s")
  })
})

describe("renderer registry", () => {
  const rendererFor = (toolName: string) => findRenderer(toolRenderers, toolName, {}).name

  it("routes each MVP tool to its renderer", () => {
    expect(rendererFor("Read")).toBe("Read")
    expect(rendererFor("Edit")).toBe("Edit/Write")
    expect(rendererFor("Write")).toBe("Edit/Write")
    expect(rendererFor("Bash")).toBe("Bash")
    expect(rendererFor("PowerShell")).toBe("Bash")
    expect(rendererFor("Glob")).toBe("Glob/Grep")
    expect(rendererFor("Grep")).toBe("Glob/Grep")
    expect(rendererFor("Skill")).toBe("Skill")
    expect(rendererFor("Task")).toBe("Subagent")
    expect(rendererFor("mcp__github__create_issue")).toBe("MCP")
  })

  it("shows Humanity's open_thread as a thread, not as any MCP tool", () => {
    expect(rendererFor(OPEN_THREAD_TOOL)).toBe("Thread")
    expect(rendererFor("mcp__humanity__other")).toBe("MCP")
  })

  it("falls back to the generic renderer for anything else", () => {
    expect(rendererFor("TodoWrite")).toBe("Generic")
    expect(rendererFor("mcp__broken")).toBe("Generic")
  })

  it("shows a question as a question, and a malformed one as raw input", () => {
    const input = { questions: [{ question: "Which one?", options: [{ label: "A" }] }] }
    expect(findRenderer(toolRenderers, "AskUserQuestion", input).name).toBe("Question")
    expect(rendererFor("AskUserQuestion")).toBe("Generic")
  })

  it("refuses a registry without a catch-all", () => {
    expect(() => findRenderer([], "Read", {})).toThrow(/catch-all/)
  })
})
