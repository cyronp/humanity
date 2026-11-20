import { describe, expect, it } from "vitest"
import {
  formatTokens,
  providerSwitchDetail,
  providerSwitchSummary,
} from "../src/features/chat/providerSwitch.ts"

const moved = {
  _tag: "provider_switch",
  from: "claude-code",
  to: "codex",
  model: "gpt-test",
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

describe("providerSwitchSummary", () => {
  it("says the context will be transferred, and what it costs, until a message carries it", () => {
    expect(providerSwitchSummary(moved)).toBe(
      "Continued on Codex · gpt-test · Context will be transferred with your next message (~12k tokens)",
    )
    expect(providerSwitchSummary(moved, true)).toBe(
      "Continued on Codex · gpt-test · Context transferred (~12k tokens)",
    )
    expect(providerSwitchSummary({ ...moved, model: null, included: 0, tokens: 0 })).toBe(
      "Continued on Codex",
    )
  })

  it("leaves out the cost of a switch recorded without one", () => {
    const { tokens: _tokens, ...unpriced } = moved
    expect(providerSwitchSummary(unpriced, true)).toBe(
      "Continued on Codex · gpt-test · Context transferred",
    )
  })

  it("says when an agent comes back to its own conversation", () => {
    const back = {
      ...moved,
      from: "codex",
      to: "claude-code",
      model: null,
      resumed: true,
      included: 2,
      tokens: 640,
    } as const
    expect(providerSwitchSummary(back)).toBe(
      "Back on Claude Code · Resumes its own conversation · What it missed will be transferred with your next message (~640 tokens)",
    )
    expect(providerSwitchSummary({ ...back, included: 0, tokens: 0 })).toBe(
      "Back on Claude Code · Resumes its own conversation",
    )
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
