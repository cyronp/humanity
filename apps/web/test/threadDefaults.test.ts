import { ProjectId, type Session, SessionId } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { type OfferedModels, threadDefaults } from "@/features/home/threadDefaults"

const session = (id: string, overrides: Partial<Session> = {}): Session => ({
  id: SessionId.make(id),
  projectId: ProjectId.make("p1"),
  provider: "claude-code",
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

const models: OfferedModels = {
  "claude-code": [{ value: "default" }, { value: "opus" }],
  codex: [{ value: "gpt-codex" }],
}

describe("threadDefaults", () => {
  it("starts on Claude Code's defaults and Auto mode when there is no thread yet", () => {
    expect(threadDefaults([], models)).toEqual({
      provider: "claude-code",
      model: null,
      effort: null,
      autonomy: "auto",
    })
  })

  it("follows the most recent thread's model and effort, never its autonomy", () => {
    const sessions = [
      session("latest", { model: "opus", effort: "high", autonomy: "ask" }),
      session("older", { model: "sonnet", effort: "low", autonomy: "accept_edits" }),
    ]
    expect(threadDefaults(sessions, models)).toEqual({
      provider: "claude-code",
      model: "opus",
      effort: "high",
      autonomy: "auto",
    })
  })

  it("starts on the project's autonomy over the pinned one", () => {
    const pinned = { autonomy: "ask" as const, effort: null, model: null }
    expect(threadDefaults([], models, pinned, { defaultAutonomy: null }).autonomy).toBe("ask")
    expect(threadDefaults([], models, pinned, { defaultAutonomy: "accept_edits" }).autonomy).toBe(
      "accept_edits",
    )
  })

  it("drops a model Claude Code no longer offers, keeping the rest", () => {
    const sessions = [session("latest", { model: "retired", effort: "max", autonomy: "auto" })]
    expect(threadDefaults(sessions, models)).toEqual({
      provider: "claude-code",
      model: null,
      effort: "max",
      autonomy: "auto",
    })
  })

  it("follows the last thread's provider, with a model that provider still offers", () => {
    const onCodex = [session("latest", { provider: "codex", model: "gpt-codex" })]
    expect(threadDefaults(onCodex, models)).toMatchObject({ provider: "codex", model: "gpt-codex" })
    const stale = [session("latest", { provider: "codex", model: "opus" })]
    expect(threadDefaults(stale, models)).toMatchObject({ provider: "codex", model: null })
  })

  it("keeps the model while the offered models are still loading", () => {
    const sessions = [session("latest", { model: "opus" })]
    expect(threadDefaults(sessions, {}).model).toBe("opus")
  })

  it("starts on the pinned effort and autonomy instead of the last thread's", () => {
    const sessions = [session("latest", { model: "opus", effort: "high", autonomy: "auto" })]
    expect(
      threadDefaults(sessions, models, { autonomy: "ask", effort: "low", model: null }),
    ).toEqual({
      provider: "claude-code",
      model: "opus",
      effort: "low",
      autonomy: "ask",
    })
  })

  it("treats a pinned model default as a pin, not as no pin", () => {
    const sessions = [session("latest", { effort: "high", autonomy: "auto" })]
    expect(
      threadDefaults(sessions, models, { autonomy: null, effort: "default", model: null }),
    ).toEqual({
      provider: "claude-code",
      model: null,
      effort: null,
      autonomy: "auto",
    })
  })

  it("uses the pins when there is no thread yet", () => {
    expect(
      threadDefaults([], models, { autonomy: "accept_edits", effort: "max", model: null }),
    ).toEqual({
      provider: "claude-code",
      model: null,
      effort: "max",
      autonomy: "accept_edits",
    })
  })

  it("starts on the pinned model, and on the project's own default model before it", () => {
    const sessions = [session("latest", { model: "opus", provider: "claude-code" })]
    const pinned = {
      autonomy: null,
      effort: null,
      model: { provider: "codex" as const, model: "gpt-codex" },
    }
    expect(threadDefaults(sessions, models, pinned)).toMatchObject({
      provider: "codex",
      model: "gpt-codex",
    })
    expect(
      threadDefaults(sessions, models, pinned, {
        defaultAutonomy: null,
        settings: { defaultModel: { provider: "claude-code", model: null } },
      }),
    ).toMatchObject({ provider: "claude-code", model: null })
  })

  it("drops a pinned model its provider no longer offers, keeping the provider", () => {
    const pinned = {
      autonomy: null,
      effort: null,
      model: { provider: "codex" as const, model: "retired" },
    }
    expect(threadDefaults([], models, pinned)).toMatchObject({ provider: "codex", model: null })
  })
})
