import { type Approval, QUESTION_TOOL, type ToolCall } from "@humanity/contracts"
import { durationMs } from "@/features/tools/inputs"
import type { SessionView } from "@/features/session/state"

export type TimelineEntry =
  | {
      readonly _tag: "tool"
      readonly at: string
      readonly call: ToolCall
      readonly approval: Approval | undefined
      readonly durationMs: number | undefined
    }
  | {
      readonly _tag: "decision"
      readonly at: string
      readonly approval: Approval
      /** How long the agent waited for the human. */
      readonly waitedMs: number | undefined
    }

const approvalToolUseId = (approval: Approval) =>
  approval._tag === "change" ? approval.change.toolUseId : approval.confirmation.toolUseId

const createdAt = (approval: Approval) =>
  approval._tag === "change" ? approval.change.createdAt : approval.confirmation.createdAt

const decidedAt = (approval: Approval) =>
  approval._tag === "change" ? approval.change.decidedAt : approval.confirmation.decidedAt

const between = (from: string, to: string) => {
  const ms = Date.parse(to) - Date.parse(from)
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

/**
 * Everything that happened in a session, oldest first: each tool call (Skill
 * loads included) and each human decision, with how long it took.
 */
export const buildTimeline = (view: SessionView): Array<TimelineEntry> => {
  const approvals = new Map(
    view.approvals.map((approval) => [approvalToolUseId(approval), approval]),
  )
  const tools: Array<TimelineEntry> = Object.values(view.toolCalls).map((call) => ({
    _tag: "tool",
    at: call.startedAt,
    call,
    approval: approvals.get(call.toolUseId),
    durationMs: durationMs(call),
  }))
  const decisions: Array<TimelineEntry> = view.approvals.flatMap(
    (approval): Array<TimelineEntry> => {
      const at = decidedAt(approval)
      if (at === undefined) return []
      return [{ _tag: "decision", at, approval, waitedMs: between(createdAt(approval), at) }]
    },
  )
  // Stable sort: a decision made in the same millisecond as its call stays after it.
  return [...tools, ...decisions].sort((a, b) => a.at.localeCompare(b.at))
}

/** One sentence for a human decision. */
export const describeDecision = (approval: Approval): string => {
  if (approval._tag === "confirmation") {
    const { status, toolName } = approval.confirmation
    if (toolName === QUESTION_TOOL) {
      if (status === "allowed") return "You answered the agent's question"
      if (status === "denied") return "You chose to talk about the agent's question"
      return "The agent's question expired"
    }
    if (status === "allowed") return `You allowed ${toolName}`
    if (status === "denied") return `You denied ${toolName}`
    return `${toolName} request expired`
  }
  const { status, filePath, hunks } = approval.change
  const approved = hunks.filter((hunk) => hunk.status === "approved").length
  switch (status) {
    case "applied":
      return `You allowed the change to ${filePath}`
    // Only on changes from when hunks were decided one by one.
    case "partially_applied":
      return `You approved ${approved} of ${hunks.length} hunks of ${filePath}`
    case "rejected":
      return `You denied the change to ${filePath}`
    case "expired":
      return `The change to ${filePath} expired`
    case "pending":
      return `Waiting for you to allow the change to ${filePath}`
  }
}
