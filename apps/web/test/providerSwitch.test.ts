import { describe, expect, it } from "vitest"
import {
  formatTokens,
  handoffTokens,
  handoffWeight,
  modelLabel,
  providerSwitchDetail,
  providerSwitchStatus,
  providerSwitchSummary,
} from "../src/features/chat/providerSwitch.ts"

const moved = {
  _tag: "provider_switch",
  from: "claude-code",
  to: "codex",
  fromModel: "opus",
  model: "gpt-6-luna",
  resumed: false,
  included: 12,
  omitted: 0,
  tokens: 12_400,
} as const

describe("formatTokens", () => {
  it("reads like a person would say it", () => {
    expect(formatTokens(850)).toBe("850")
    expect(formatTokens(1_000)).toBe("1k")
    expect(formatTokens(1_240)).toBe("1.2k")
    expect(formatTokens(48_400)).toBe("48k")
  })
})

describe("handoffWeight", () => {
  it("is light under 4k tokens, medium under 10k, heavy from there", () => {
    expect(handoffWeight(3_999)).toBe("light")
    expect(handoffWeight(4_000)).toBe("medium")
    expect(handoffWeight(9_999)).toBe("medium")
    expect(handoffWeight(10_000)).toBe("heavy")
  })
})

describe("the divider", () => {
  it("names each side by its model, or by its provider on the default", () => {
    expect(modelLabel("codex", "gpt-6-luna")).toBe("gpt-6-luna")
    expect(modelLabel("claude-code", null)).toBe("Claude Code")
    expect(modelLabel("claude-code", undefined)).toBe("Claude Code")
  })

  it("says the context will be transferred, then that it was", () => {
    expect(providerSwitchStatus(moved)).toBe("Context will be transferred")
    expect(providerSwitchStatus(moved, true)).toBe("Context transferred")
    expect(providerSwitchSummary(moved)).toBe(
      "opus → gpt-6-luna · Context will be transferred · ~12k tokens",
    )
    expect(providerSwitchSummary({ ...moved, fromModel: null, included: 0, tokens: 0 })).toBe(
      "Claude Code → gpt-6-luna",
    )
  })

  it("has no cost when nothing was sent or none was recorded", () => {
    const { tokens: _tokens, ...unpriced } = moved
    expect(handoffTokens(unpriced)).toBeUndefined()
    expect(handoffTokens({ ...moved, included: 0 })).toBeUndefined()
    expect(handoffTokens(moved)).toBe(12_400)
  })

  it("says when an agent comes back to its own conversation", () => {
    const back = {
      ...moved,
      from: "codex",
      to: "claude-code",
      fromModel: "gpt-6-luna",
      model: null,
      resumed: true,
      included: 2,
      tokens: 640,
    } as const
    expect(providerSwitchSummary(back)).toBe(
      "gpt-6-luna → Claude Code · Resumes its own conversation · What it missed will be transferred · ~640 tokens",
    )
    expect(providerSwitchStatus(back, true)).toBe(
      "Resumes its own conversation · What it missed was transferred",
    )
    expect(providerSwitchStatus({ ...back, included: 0 })).toBe("Resumes its own conversation")
  })
})

describe("providerSwitchDetail", () => {
  it("says how much went in full, what was left to read, and that tokens are estimated", () => {
    expect(providerSwitchDetail({ ...moved, omitted: 3 })).toBe(
      "12 entries of the conversation in full, 3 older entries the agent can read when it needs them. Tokens are estimated at about 4 characters each; the provider's own count may differ.",
    )
    expect(providerSwitchDetail({ ...moved, included: 0 })).toBe("Nothing to transfer.")
  })
})
