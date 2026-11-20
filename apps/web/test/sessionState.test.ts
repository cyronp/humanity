import {
  type Approval,
  ChangeId,
  type ChatMessage,
  ConfirmationId,
  ProjectId,
  type Session,
  type SessionEvent,
  SessionId,
  type ToolCall,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  addEarlierPage,
  approvalsByToolUse,
  isBusy,
  joinEarlier,
  pendingChanges,
  pendingConfirmations,
  reduceSessionEvent,
  reduceSessionEvents,
  type SessionView,
} from "@/features/session/state"

const sessionId = SessionId.make("s1")

const session: Session = {
  id: sessionId,
  projectId: ProjectId.make("p1"),
  provider: "claude-code",
  sdkSessionId: null,
  title: "Test",
  branch: "humanity/s1-test",
  worktreePath: "/home/me/.humanity/worktrees/p1/s1",
  inWorktree: true,
  origin: "humanity",
  model: null,
  effort: null,
  autonomy: "ask",
  status: "idle",
  createdAt: "2026-11-09T00:00:00.000Z",
  updatedAt: "2026-11-09T00:00:00.000Z",
}

const message = (id: string, content: ChatMessage["content"]): ChatMessage => ({
  id,
  sessionId,
  content,
  createdAt: "2026-11-09T00:00:01.000Z",
})

const toolCall = (status: ToolCall["status"]): ToolCall => ({
  id: "tc1",
  sessionId,
  toolUseId: "toolu_1",
  toolName: "Skill",
  input: { skill: "review" },
  output: null,
  status,
  startedAt: "2026-11-09T00:00:02.000Z",
  finishedAt: null,
})

const snapshot = (overrides: Partial<Extract<SessionEvent, { _tag: "Snapshot" }>> = {}) =>
  ({
    _tag: "Snapshot",
    session,
    messages: [],
    toolCalls: [],
    hasEarlier: false,
    approvals: [],
    usage: { context: null, plan: null },
    ...overrides,
  }) satisfies SessionEvent

const fold = (events: ReadonlyArray<SessionEvent>, initial?: SessionView) =>
  events.reduce<SessionView | undefined>(reduceSessionEvent, initial)

describe("reduceSessionEvent", () => {
  it("ignores everything until the snapshot arrives", () => {
    expect(fold([{ _tag: "TextDelta", text: "hi" }])).toBeUndefined()
    expect(fold([snapshot()])?.session.id).toBe("s1")
  })

  it("builds the view from a snapshot, indexing tool calls and skills", () => {
    const view = fold([snapshot({ toolCalls: [toolCall("succeeded")] })])
    expect(view?.toolCalls["toolu_1"]?.status).toBe("succeeded")
    expect(view?.skills).toEqual([
      { toolUseId: "toolu_1", skill: "review", at: "2026-11-09T00:00:02.000Z" },
    ])
  })

  it("accumulates streamed text and clears it when the full message lands", () => {
    const streaming = fold([
      snapshot(),
      { _tag: "SessionStatusChanged", status: "running", error: null },
      { _tag: "TextDelta", text: "Hel" },
      { _tag: "TextDelta", text: "lo" },
    ])
    expect(streaming?.draft).toBe("Hello")
    expect(streaming && isBusy(streaming.session.status)).toBe(true)

    const done = fold(
      [
        {
          _tag: "AgentMessage",
          message: message("m1", {
            _tag: "assistant",
            blocks: [{ _tag: "text", text: "Hello" }],
            parentToolUseId: null,
          }),
        },
      ],
      streaming,
    )
    expect(done?.draft).toBe("")
    expect(done?.messages).toHaveLength(1)
  })

  it("keeps the draft while a tool-only message arrives", () => {
    const view = fold([
      snapshot(),
      { _tag: "TextDelta", text: "Let me check" },
      {
        _tag: "AgentMessage",
        message: message("m1", {
          _tag: "assistant",
          blocks: [{ _tag: "tool_use", toolUseId: "toolu_1", toolName: "Read", input: {} }],
          parentToolUseId: null,
        }),
      },
    ])
    expect(view?.draft).toBe("Let me check")
  })

  it("does not duplicate a message seen in both the snapshot and the live stream", () => {
    const user = message("m1", { _tag: "user", text: "hi" })
    const view = fold([snapshot({ messages: [user] }), { _tag: "AgentMessage", message: user }])
    expect(view?.messages).toHaveLength(1)
  })

  it("drops a message the daemon removed, such as a provider switch that was replaced", () => {
    const user = message("m1", { _tag: "user", text: "hi" })
    const moved = message("m2", {
      _tag: "provider_switch",
      from: "claude-code",
      to: "kiro",
      model: null,
      resumed: false,
      included: 1,
      omitted: 0,
    })
    const view = fold([
      snapshot({ messages: [user, moved] }),
      { _tag: "MessageRemoved", messageId: "m2" },
    ])
    expect(view?.messages.map((each) => each.id)).toEqual(["m1"])
  })

  it("updates tool calls as they start and finish", () => {
    const view = fold([
      snapshot(),
      { _tag: "ToolCallStarted", toolCall: toolCall("running") },
      { _tag: "ToolCallFinished", toolCall: toolCall("denied") },
    ])
    expect(view?.toolCalls["toolu_1"]?.status).toBe("denied")
  })

  it("records errors and clears them once the session moves on", () => {
    const failed = fold([
      snapshot(),
      { _tag: "SessionStatusChanged", status: "error", error: "Invalid API key" },
    ])
    expect(failed?.error).toBe("Invalid API key")
    expect(failed?.session.status).toBe("error")

    const recovered = fold(
      [{ _tag: "SessionStatusChanged", status: "running", error: null }],
      failed,
    )
    expect(recovered?.error).toBeNull()
  })

  it("replaces stale state with a fresh snapshot after a reconnect", () => {
    const before = fold([snapshot(), { _tag: "TextDelta", text: "partial" }])
    const after = fold([snapshot({ session: { ...session, status: "interrupted" } })], before)
    expect(after?.draft).toBe("")
    expect(after?.session.status).toBe("interrupted")
  })

  it("adds each skill load once", () => {
    const event: SessionEvent = { _tag: "SkillLoaded", toolUseId: "t9", skill: "pdf", at: "x" }
    expect(fold([snapshot(), event, event])?.skills).toHaveLength(1)
  })

  it("tracks approvals as they are requested and resolved", () => {
    const change: Approval = {
      _tag: "change",
      change: {
        id: ChangeId.make("c1"),
        sessionId,
        toolUseId: "toolu_edit",
        toolName: "Edit",
        filePath: "a.ts",
        kind: "modify",
        originalContent: "a",
        proposedContent: "b",
        hunks: [],
        status: "pending",
        createdAt: "t1",
      },
    }
    const confirmation: Approval = {
      _tag: "confirmation",
      confirmation: {
        id: ConfirmationId.make("k1"),
        sessionId,
        toolUseId: "toolu_bash",
        toolName: "Bash",
        input: { command: "ls" },
        status: "pending",
        createdAt: "t2",
      },
    }
    const waiting = fold([
      snapshot(),
      { _tag: "ApprovalRequested", approval: change },
      { _tag: "ApprovalRequested", approval: confirmation },
    ])
    expect(waiting && pendingChanges(waiting.approvals).map((c) => c.id)).toEqual(["c1"])
    expect(waiting && pendingConfirmations(waiting.approvals).map((c) => c.id)).toEqual(["k1"])
    expect(waiting && approvalsByToolUse(waiting.approvals).get("toolu_bash")?._tag).toBe(
      "confirmation",
    )

    const decided = fold(
      [
        {
          _tag: "ApprovalResolved",
          approval: { _tag: "change", change: { ...change.change, status: "partially_applied" } },
        },
      ],
      waiting,
    )
    expect(decided?.approvals).toHaveLength(2)
    expect(decided && pendingChanges(decided.approvals)).toEqual([])
    expect(decided && pendingConfirmations(decided.approvals)).toHaveLength(1)
    expect(decided && approvalsByToolUse(decided.approvals).get("toolu_edit")?._tag).toBe("change")
  })

  it("folds a batch of events like the same events one by one", () => {
    const events: ReadonlyArray<SessionEvent> = [
      snapshot(),
      { _tag: "SessionStatusChanged", status: "running", error: null },
      { _tag: "TextDelta", text: "Hel" },
      { _tag: "TextDelta", text: "lo" },
    ]
    const batched = reduceSessionEvents(reduceSessionEvents(undefined, events.slice(0, 2)), [
      ...events.slice(2),
    ])
    expect(batched).toEqual(fold(events))
    expect(batched?.draft).toBe("Hello")
  })

  it("leaves what a streamed token does not touch as it was, so the transcript can skip it", () => {
    const before = fold([snapshot({ messages: [message("m1", { _tag: "user", text: "hi" })] })])
    const after = before && reduceSessionEvent(before, { _tag: "TextDelta", text: "x" })
    expect(after?.messages).toBe(before?.messages)
    expect(after?.toolCalls).toBe(before?.toolCalls)
    expect(after?.approvals).toBe(before?.approvals)
  })
})

describe("earlier pages", () => {
  const user = (id: string) => message(id, { _tag: "user", text: id })
  const live = fold([snapshot({ messages: [user("m5"), user("m6")], hasEarlier: true })])

  it("shows the live view alone until a page is read", () => {
    expect(live && joinEarlier(live, undefined)).toBe(live)
  })

  it("puts each page read before the ones already shown", () => {
    if (live === undefined) return expect.fail("no view")
    const once = addEarlierPage(undefined, "m5", {
      messages: [user("m3"), user("m4")],
      toolCalls: [toolCall("succeeded")],
      hasEarlier: true,
    })
    const twice = addEarlierPage(once, "m5", {
      messages: [user("m1"), user("m2")],
      toolCalls: [],
      hasEarlier: false,
    })
    const shown = joinEarlier(live, twice)
    expect(shown.messages.map((each) => each.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"])
    expect(shown.toolCalls["toolu_1"]?.status).toBe("succeeded")
    expect(shown.hasEarlier).toBe(false)
  })

  it("drops the pages once a snapshot starts the live view elsewhere", () => {
    const pages = addEarlierPage(undefined, "m5", {
      messages: [user("m4")],
      toolCalls: [],
      hasEarlier: true,
    })
    const moved = fold([snapshot({ messages: [user("m6")], hasEarlier: true })])
    expect(moved && joinEarlier(moved, pages)).toBe(moved)
    expect(addEarlierPage(pages, "m6", { messages: [], toolCalls: [], hasEarlier: true })).toEqual({
      attachedTo: "m6",
      messages: [],
      toolCalls: {},
      hasEarlier: true,
    })
  })
})
