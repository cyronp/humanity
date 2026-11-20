import { describe, expect, it } from "vitest"
import {
  formatTokens,
  handoffTokens,
  handoffWeight,
  providerSwitchDetail,
  providerSwitchStatus,
  providerSwitchSummary,
} from "../src/features/chat/providerSwitch.ts"
import { modelDisplayName, pickerModels } from "../src/features/providers/models.ts"

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
  it("says the context will be transferred, then that it was", () => {
    expect(providerSwitchStatus(moved)).toBe("Context will be transferred")
    expect(providerSwitchStatus(moved, true)).toBe("Context transferred")
    const names = { from: "Opus 5.5", to: "GPT-6 Luna" }
    expect(providerSwitchSummary(moved, names)).toBe(
      "Opus 5.5 → GPT-6 Luna · Context will be transferred · ~12k tokens",
    )
    expect(providerSwitchSummary({ ...moved, included: 0, tokens: 0 }, names)).toBe(
      "Opus 5.5 → GPT-6 Luna",
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
    expect(providerSwitchSummary(back, { from: "GPT-6 Luna", to: "Default" })).toBe(
      "GPT-6 Luna → Default · Resumes its own conversation · What it missed will be transferred · ~640 tokens",
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

describe("modelDisplayName", () => {
  const claude = pickerModels("claude-code", [
    { value: "opus", displayName: "Opus 5.5 (recommended)", description: "" },
  ])
  const codex = pickerModels("codex", [
    { value: "gpt-6-luna", displayName: "GPT-6 Luna", description: "" },
  ])

  it("names a model as the picker does", () => {
    expect(modelDisplayName(claude, "opus")).toBe("Opus 5.5")
    expect(modelDisplayName(codex, "gpt-6-luna")).toBe("GPT-6 Luna")
  })

  it("names the default by the picker's default row", () => {
    expect(modelDisplayName(claude, null)).toBe("Default")
    expect(modelDisplayName(codex, undefined)).toBe("Default")
  })

  it("falls back to the model's id when the provider no longer lists it", () => {
    expect(modelDisplayName(codex, "gpt-5-old")).toBe("gpt-5-old")
    expect(modelDisplayName([], null)).toBe("Default")
  })
})
