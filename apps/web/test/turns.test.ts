import { type ChatMessage, type MessageContent, SessionId } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  formatWorked,
  itemOfMessage,
  phasesOf,
  phaseSummary,
  transcriptItems,
  turnParts,
  workedMs,
} from "@/features/chat/turns"

const message = (id: string, content: MessageContent, createdAt = "2026-11-23T10:00:00.000Z") =>
  ({ id, sessionId: SessionId.make("s1"), content, createdAt }) satisfies ChatMessage

const tool = (toolUseId: string, toolName: string, input: unknown = {}) =>
  ({ _tag: "tool_use", toolUseId, toolName, input }) as const
const text = (value: string) => ({ _tag: "text", text: value }) as const
const thinking = (value: string) => ({ _tag: "thinking", text: value }) as const

const assistant = (
  id: string,
  blocks: ReadonlyArray<ReturnType<typeof tool | typeof text | typeof thinking>>,
  parentToolUseId: string | null = null,
) => message(id, { _tag: "assistant", blocks, parentToolUseId })

const result = (id: string, durationMs = 134_000, isError = false) =>
  message(id, {
    _tag: "result",
    subtype: isError ? "error_during_execution" : "success",
    isError,
    text: null,
    durationMs,
    numTurns: 3,
    costUsd: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  })

describe("transcriptItems", () => {
  it("puts everything from the human's message to the turn's result into one turn", () => {
    const items = transcriptItems([
      message("u1", { _tag: "user", text: "fix it" }, "2026-11-23T10:00:00.000Z"),
      message("i1", { _tag: "system_init", model: "opus", tools: [], skills: [], mcpServers: [] }),
      assistant("a1", [tool("t1", "Read")]),
      message("r1", { _tag: "tool_results", results: [], parentToolUseId: null }),
      assistant("a2", [text("Done.")]),
      result("x1"),
      message("u2", { _tag: "user", text: "thanks" }, "2026-11-23T10:05:00.000Z"),
      assistant("a3", [text("You're welcome.")]),
    ])
    expect(items.map((item) => [item._tag, item.id])).toEqual([
      ["message", "u1"],
      ["turn", "i1"],
      ["message", "u2"],
      ["turn", "a3"],
    ])
    const [, first, , second] = items
    expect(first?._tag === "turn" && first.messages.map((each) => each.id)).toEqual([
      "i1",
      "a1",
      "a2",
      "x1",
    ])
    expect(second?._tag === "turn" && second.startedAt).toBe("2026-11-23T10:05:00.000Z")
  })

  it("keeps a notice in its place, splitting the turn around it", () => {
    const items = transcriptItems([
      message("u1", { _tag: "user", text: "go" }),
      assistant("a1", [tool("t1", "Bash")]),
      message("n1", { _tag: "notice", level: "warning", text: "Heads up" }),
      assistant("a2", [text("Done.")]),
      result("x1"),
    ])
    expect(items.map((item) => item.id)).toEqual(["u1", "a1", "n1", "a2"])
  })

  it("finds the item each message is shown in", () => {
    const items = transcriptItems([
      message("u1", { _tag: "user", text: "go" }),
      assistant("a1", [tool("t1", "Bash")]),
      result("x1"),
    ])
    const owners = itemOfMessage(items)
    expect(owners.get("u1")).toBe("u1")
    expect(owners.get("x1")).toBe("a1")
  })
})

describe("turnParts", () => {
  it("keeps the text after the last tool call as the reply, and the rest as steps", () => {
    const parts = turnParts([
      assistant("a1", [thinking("plan"), text("Looking."), tool("t1", "Read")]),
      assistant("a2", [thinking("ok"), text("All good."), text("  ")]),
      result("x1"),
    ])
    expect(parts.reply).toEqual(["All good."])
    expect(parts.steps.map((step) => step._tag)).toEqual(["thinking", "text", "tool", "thinking"])
    expect(parts.result?.durationMs).toBe(134_000)
  })

  it("makes every text the reply when the agent called no tool", () => {
    const parts = turnParts([assistant("a1", [thinking("hm"), text("Hi."), text("Bye.")])])
    expect(parts.reply).toEqual(["Hi.", "Bye."])
    expect(parts.steps.map((step) => step._tag)).toEqual(["thinking"])
  })

  it("files a sub-agent's work under the call that started it", () => {
    const parts = turnParts([
      assistant("a1", [tool("t1", "Task")]),
      assistant("a2", [tool("t2", "Read"), text("found it")], "t1"),
      assistant("a3", [text("Done.")]),
    ])
    expect(parts.steps).toHaveLength(1)
    expect(parts.subagents.get("t1")?.map((step) => step._tag)).toEqual(["tool", "text"])
    expect(parts.reply).toEqual(["Done."])
  })
})

describe("phasesOf", () => {
  it("groups consecutive calls of one kind, with thoughts in the phase they follow", () => {
    const { steps } = turnParts([
      assistant("a1", [
        thinking("plan"),
        tool("t1", "Read"),
        tool("t2", "Grep"),
        text("Now edit."),
        tool("t3", "Edit"),
        tool("t4", "Write"),
        tool("t5", "Bash"),
        thinking("failed"),
        tool("t6", "mcp__linear__get_issue"),
        tool("t7", "mcp__linear__list_issues"),
        tool("t8", "Bash"),
      ]),
    ])
    expect(phasesOf(steps).map((phase) => [phase.kind, phase.steps.length])).toEqual([
      ["explore", 4],
      ["edit", 2],
      ["run", 2],
      ["other", 1],
      ["other", 1],
      ["run", 1],
    ])
  })

  it("keeps thoughts before any call as notes", () => {
    const { steps } = turnParts([assistant("a1", [thinking("hm"), text("Hi.")])])
    expect(phasesOf(steps).map((phase) => phase.kind)).toEqual(["notes"])
  })
})

describe("phaseSummary", () => {
  const phaseOf = (...blocks: Array<ReturnType<typeof tool>>) => {
    const [phase] = phasesOf(turnParts([assistant("a1", blocks)]).steps)
    if (phase === undefined) throw new Error("no phase")
    return phase
  }

  it("counts what an exploring phase read and searched", () => {
    const phase = phaseOf(tool("t1", "Read"), tool("t2", "Read"), tool("t3", "Grep"))
    expect(phaseSummary(phase, false, "/repo")).toEqual({
      title: "Explored",
      detail: "2 files read, 1 search",
    })
  })

  it("names the one file an editing phase changed, relative to the folder", () => {
    const phase = phaseOf(
      tool("t1", "Edit", { file_path: "/repo/src/a.ts" }),
      tool("t2", "Edit", { file_path: "/repo/src/a.ts" }),
    )
    expect(phaseSummary(phase, false, "/repo").title).toBe("Edited a.ts")
    expect(
      phaseSummary(
        phaseOf(
          tool("t1", "Edit", { file_path: "/repo/a.ts" }),
          tool("t2", "Write", { file_path: "/repo/b.ts" }),
        ),
        true,
        "/repo",
      ).title,
    ).toBe("Editing 2 files")
  })

  it("shows the command of a phase that ran one", () => {
    const one = phasesOf(
      turnParts([assistant("a1", [tool("t1", "Bash", { command: "npm test" }), thinking("hm")])])
        .steps,
    )[0]
    if (one === undefined) throw new Error("no phase")
    expect(phaseSummary(one, true, "/repo")).toEqual({ title: "Running", command: "npm test" })
    expect(phaseSummary(phaseOf(tool("t1", "Bash"), tool("t2", "Bash")), false, "/").title).toBe(
      "Ran 2 commands",
    )
  })
})

describe("formatWorked", () => {
  it("says how long the agent worked in seconds, minutes and hours", () => {
    expect(formatWorked(400)).toBe("0s")
    expect(formatWorked(12_300)).toBe("12s")
    expect(formatWorked(134_000)).toBe("2m 14s")
    expect(formatWorked(120_000)).toBe("2m")
    expect(formatWorked(3_780_000)).toBe("1h 3m")
  })
})

describe("workedMs", () => {
  it("takes the result's duration, else the time from the human's message to the last one", () => {
    const messages = [assistant("a1", [text("hi")])]
    expect(workedMs("2026-11-23T10:00:00.000Z", messages, undefined)).toBe(0)
    const later = [
      message(
        "a1",
        { _tag: "assistant", blocks: [], parentToolUseId: null },
        "2026-11-23T10:01:30.000Z",
      ),
    ]
    expect(workedMs("2026-11-23T10:00:00.000Z", later, undefined)).toBe(90_000)
    const parts = turnParts([result("x1", 5000)])
    expect(workedMs("2026-11-23T10:00:00.000Z", later, parts.result)).toBe(5000)
  })
})
