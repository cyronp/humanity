import { type Approval, ChangeId, ConfirmationId, SessionId } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { describeDecision } from "@/features/session/decisions"

const sessionId = SessionId.make("s")

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

describe("describeDecision", () => {
  it("describes a question by what the human did with it", () => {
    const question = (status: "allowed" | "denied" | "expired"): Approval => ({
      _tag: "confirmation",
      confirmation: {
        id: ConfirmationId.make("q"),
        sessionId,
        toolUseId: "ask",
        toolName: "AskUserQuestion",
        input: {},
        status,
        createdAt: "2026-11-09T10:00:00.000Z",
      },
    })
    expect(describeDecision(question("allowed"))).toBe("You answered the agent's question")
    expect(describeDecision(question("denied"))).toBe(
      "You chose to talk about the agent's question",
    )
    expect(describeDecision(question("expired"))).toBe("The agent's question expired")
  })

  it("summarizes each outcome in one sentence", () => {
    expect(describeDecision(change("applied"))).toBe("You allowed the change to src/a.ts")
    expect(
      describeDecision(change("partially_applied", [hunk(1, "approved"), hunk(2, "rejected")])),
    ).toBe("You approved 1 of 2 hunks of src/a.ts")
    expect(describeDecision(change("rejected", [hunk(1, "rejected")]))).toBe(
      "You denied the change to src/a.ts",
    )
  })
})
