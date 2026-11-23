import type { UsageAmount, UsageReport } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  dailySeries,
  formatCost,
  formatCount,
  planSeries,
  providersIn,
  rangeOf,
  shareOf,
} from "@/features/usage/usage"

const amount = (tokens: number, costUsd: number | null = null): UsageAmount => ({
  turns: 1,
  inputTokens: tokens,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd,
})

const report = (overrides: Partial<UsageReport>): UsageReport => ({
  from: "",
  to: "",
  totals: amount(0),
  byDay: [],
  byProvider: [],
  byModel: [],
  byProject: [],
  bySession: [],
  plan: [],
  ...overrides,
})

describe("usage dashboard", () => {
  it("covers whole local days, ending today", () => {
    const range = rangeOf("week", new Date(2026, 10, 22, 15, 30))
    expect(range.days).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ])
    expect(new Date(range.from).getTime()).toBe(new Date(2026, 10, 16).getTime())
    expect(new Date(range.to).getTime()).toBe(new Date(2026, 10, 23).getTime())
    expect(rangeOf("today", new Date(2026, 10, 22, 1)).days).toEqual(["2026-11-22"])
  })

  it("stacks each day's tokens by provider, with empty days kept", () => {
    const data = report({
      byDay: [
        { day: "2026-11-21", provider: "codex", amount: amount(500) },
        { day: "2026-11-21", provider: "claude-code", amount: amount(1_200) },
      ],
    })
    expect(dailySeries(data, ["2026-11-20", "2026-11-21"])).toEqual([
      { day: "2026-11-20" },
      { day: "2026-11-21", codex: 500, "claude-code": 1_200 },
    ])
    expect(providersIn(data)).toEqual(["codex", "claude-code"])
  })

  it("formats counts, costs and shares", () => {
    expect(formatCount(950)).toBe("950")
    expect(formatCount(1_250)).toBe("1.3k")
    expect(formatCount(48_000)).toBe("48k")
    expect(formatCount(2_500_000)).toBe("2.5M")
    expect(formatCost(amount(1, null))).toBeUndefined()
    expect(formatCost(amount(1, 0.004))).toBe("<$0.01")
    expect(formatCost(amount(1, 3.5))).toBe("$3.50")
    expect(shareOf(5, 0)).toBe(0)
    expect(shareOf(5, 10)).toBe(0.5)
  })

  it("draws one five-hour line per account", () => {
    const data = report({
      plan: [
        {
          provider: "claude-code",
          accountKey: "",
          window: "five_hour",
          utilization: 40,
          resetsAt: null,
          sampledAt: "2026-11-21T10:00:00.000Z",
        },
        {
          provider: "claude-code",
          accountKey: "",
          window: "seven_day",
          utilization: 10,
          resetsAt: null,
          sampledAt: "2026-11-21T10:00:00.000Z",
        },
      ],
    })
    expect(planSeries(data)).toEqual([
      {
        key: "claude-code:",
        provider: "claude-code",
        accountKey: "",
        points: [{ at: Date.parse("2026-11-21T10:00:00.000Z"), utilization: 40 }],
      },
    ])
  })
})
