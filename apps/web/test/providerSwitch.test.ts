import { describe, expect, it } from "vitest"
import { providerSwitchSummary } from "../src/features/chat/providerSwitch.ts"

const moved = {
  _tag: "provider_switch",
  from: "claude-code",
  to: "codex",
  model: null,
  resumed: false,
  included: 12,
  omitted: 0,
} as const

describe("providerSwitchSummary", () => {
  it("says where the thread went and how much of it went along", () => {
    expect(providerSwitchSummary(moved)).toBe(
      "Continued on Codex · 12 earlier messages go with your next message as context",
    )
    expect(providerSwitchSummary({ ...moved, model: "gpt-test", omitted: 30 })).toBe(
      "Continued on Codex · gpt-test · 12 earlier messages go with your next message as context; 30 older ones it can read when it needs them",
    )
    expect(providerSwitchSummary({ ...moved, included: 0 })).toBe("Continued on Codex")
  })

  it("says when an agent comes back to its own conversation", () => {
    const back = { ...moved, from: "codex", to: "claude-code", resumed: true } as const
    expect(providerSwitchSummary({ ...back, included: 1 })).toBe(
      "Back on Claude Code · it picks up its own conversation, plus 1 message from while it was away",
    )
    expect(providerSwitchSummary({ ...back, included: 0 })).toBe(
      "Back on Claude Code · it picks up its own conversation",
    )
  })
})
