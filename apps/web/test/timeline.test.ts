import {
  type Approval,
  ChangeId,
  ConfirmationId,
  ProjectId,
  SessionId,
  type ToolCall,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import type { SessionView } from "@/features/session/state"
import { buildTimeline, describeDecision } from "@/features/timeline/timeline"

const sessionId = SessionId.make("s")

const call = (
  toolUseId: string,
  toolName: string,
  startedAt: string,
  finishedAt: string | null,
): ToolCall => ({
  id: toolUseId,
  sessionId,
  toolUseId,
  toolName,
  input: {},
  output: null,
  status: finishedAt === null ? "running" : "succeeded",
  startedAt,
  finishedAt,
})

const hunk = (index: number, status: "approved" | "rejected") => ({
  id: `h${index}`,
  index,
  oldStart: index,
  oldLines: 1,
  newStart: index,
  newLines: 1,
  lines: ["-a", "+b"],
  status,
})

const change = (
  status: "applied" | "partially_applied" | "rejected",
  hunks = [hunk(1, "approved")],
): Approval => ({
  _tag: "change",
  change: {
    id: ChangeId.make("c"),
    sessionId,
    toolUseId: "edit",
    toolName: "Edit",
    filePath: "src/a.ts",
    kind: "modify",
    originalContent: "a",
    proposedContent: "b",
    hunks,
    status,
    createdAt: "2026-11-09T10:00:01.000Z",
    decidedAt: "2026-11-09T10:00:31.000Z",
  },
})

const view = (
  toolCalls: ReadonlyArray<ToolCall>,
  approvals: ReadonlyArray<Approval>,
): SessionView => ({
  session: {
    id: sessionId,
    projectId: ProjectId.make("p"),
    sdkSessionId: null,
    title: "t",
    branch: "b",
    worktreePath: "/w",
    status: "idle",
    createdAt: "",
    updatedAt: "",
  },
  messages: [],
  toolCalls: Object.fromEntries(toolCalls.map((c) => [c.toolUseId, c])),
  skills: [],
  approvals,
  draft: "",
  error: null,
})

describe("buildTimeline", () => {
  it("orders tool calls and decisions by time, with durations", () => {
    const entries = buildTimeline(
      view(
        [
          call("edit", "Edit", "2026-11-09T10:00:01.000Z", "2026-11-09T10:00:31.200Z"),
          call("read", "Read", "2026-11-09T10:00:00.000Z", "2026-11-09T10:00:00.050Z"),
          call("bash", "Bash", "2026-11-09T10:00:40.000Z", null),
        ],
        [change("partially_applied", [hunk(1, "approved"), hunk(2, "rejected")])],
      ),
    )
    expect(
      entries.map((entry) => (entry._tag === "tool" ? entry.call.toolName : "decision")),
    ).toEqual(["Read", "Edit", "decision", "Bash"])
    expect(entries[0]?._tag === "tool" && entries[0].durationMs).toBe(50)
    expect(entries[1]?._tag === "tool" && entries[1].approval?._tag).toBe("change")
    expect(entries[2]?._tag === "decision" && entries[2].waitedMs).toBe(30_000)
    expect(entries[3]?._tag === "tool" && entries[3].durationMs).toBeUndefined()
  })

  it("leaves pending approvals out until they are decided", () => {
    const pending: Approval = {
      _tag: "confirmation",
      confirmation: {
        id: ConfirmationId.make("k"),
        sessionId,
        toolUseId: "bash",
        toolName: "Bash",
        input: {},
        status: "pending",
        createdAt: "2026-11-09T10:00:00.000Z",
      },
    }
    expect(buildTimeline(view([], [pending]))).toEqual([])
  })
})

describe("describeDecision", () => {
  it("summarizes each outcome in one sentence", () => {
    expect(describeDecision(change("applied"))).toBe("You approved all 1 hunk of src/a.ts")
    expect(
      describeDecision(change("partially_applied", [hunk(1, "approved"), hunk(2, "rejected")])),
    ).toBe("You approved 1 of 2 hunks of src/a.ts")
    expect(describeDecision(change("rejected", [hunk(1, "rejected")]))).toBe(
      "You rejected the change to src/a.ts",
    )
    expect(describeDecision(change("rejected", [hunk(1, "approved"), hunk(2, "rejected")]))).toBe(
      "src/a.ts changed during review; nothing was applied",
    )
  })
})
