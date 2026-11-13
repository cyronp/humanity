import { type ClaudeModel, ProjectId, type Session, SessionId } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { threadDefaults } from "@/features/home/threadDefaults"

const session = (id: string, overrides: Partial<Session> = {}): Session => ({
  id: SessionId.make(id),
  projectId: ProjectId.make("p1"),
  sdkSessionId: null,
  title: id,
  branch: "main",
  worktreePath: "/repos/web-app",
  inWorktree: false,
  origin: "humanity",
  model: null,
  effort: null,
  autonomy: "ask",
  status: "idle",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
})

const models: ReadonlyArray<ClaudeModel> = [
  { value: "default", displayName: "Default (recommended)", description: "" },
  { value: "opus", displayName: "Opus", description: "" },
]

describe("threadDefaults", () => {
  it("starts on Claude Code's defaults and Auto mode when there is no thread yet", () => {
    expect(threadDefaults([], models)).toEqual({ model: null, effort: null, autonomy: "auto" })
  })

  it("follows the most recent thread's model and effort, never its autonomy", () => {
    const sessions = [
      session("latest", { model: "opus", effort: "high", autonomy: "ask" }),
      session("older", { model: "sonnet", effort: "low", autonomy: "accept_edits" }),
    ]
    expect(threadDefaults(sessions, models)).toEqual({
      model: "opus",
      effort: "high",
      autonomy: "auto",
    })
  })

  it("starts on the project's autonomy over the pinned one", () => {
    const pinned = { autonomy: "ask" as const, effort: null }
    expect(threadDefaults([], models, pinned, { defaultAutonomy: null }).autonomy).toBe("ask")
    expect(threadDefaults([], models, pinned, { defaultAutonomy: "accept_edits" }).autonomy).toBe(
      "accept_edits",
    )
  })

  it("drops a model Claude Code no longer offers, keeping the rest", () => {
    const sessions = [session("latest", { model: "retired", effort: "max", autonomy: "auto" })]
    expect(threadDefaults(sessions, models)).toEqual({
      model: null,
      effort: "max",
      autonomy: "auto",
    })
  })

  it("keeps the model while the offered models are still loading", () => {
    const sessions = [session("latest", { model: "opus" })]
    expect(threadDefaults(sessions, undefined).model).toBe("opus")
  })

  it("starts on the pinned effort and autonomy instead of the last thread's", () => {
    const sessions = [session("latest", { model: "opus", effort: "high", autonomy: "auto" })]
    expect(threadDefaults(sessions, models, { autonomy: "ask", effort: "low" })).toEqual({
      model: "opus",
      effort: "low",
      autonomy: "ask",
    })
  })

  it("treats a pinned model default as a pin, not as no pin", () => {
    const sessions = [session("latest", { effort: "high", autonomy: "auto" })]
    expect(threadDefaults(sessions, models, { autonomy: null, effort: "default" })).toEqual({
      model: null,
      effort: null,
      autonomy: "auto",
    })
  })

  it("uses the pins when there is no thread yet", () => {
    expect(threadDefaults([], models, { autonomy: "accept_edits", effort: "max" })).toEqual({
      model: null,
      effort: "max",
      autonomy: "accept_edits",
    })
  })
})
