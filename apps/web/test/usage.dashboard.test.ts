import type { UsageAmount, UsageReport } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  cacheHitRate,
  formatAgo,
  formatCost,
  formatCount,
  formatShare,
  formatSpan,
  limitAccounts,
  providersIn,
  rangeOf,
  shareOf,
  tokenMix,
  tokenSeries,
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
  byHour: [],
  byProvider: [],
  byModel: [],
  byProject: [],
  bySession: [],
  limits: [],
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
    expect(range.hourly).toBe(false)
    expect(range.buckets).toEqual(range.days)
    const today = rangeOf("today", new Date(2026, 10, 22, 1))
    expect(today.days).toEqual(["2026-11-22"])
    expect(today.hourly).toBe(true)
    expect(today.buckets).toHaveLength(24)
    expect(today.buckets[0]).toBe("2026-11-22T00")
    expect(today.buckets[23]).toBe("2026-11-22T23")
  })

  it("stacks each day's tokens by provider, with empty days kept", () => {
    const data = report({
      byDay: [
        { day: "2026-11-21", provider: "codex", amount: amount(500) },
        { day: "2026-11-21", provider: "claude-code", amount: amount(1_200) },
      ],
      byProvider: [
        { provider: "claude-code", amount: amount(1_200) },
        { provider: "codex", amount: amount(500) },
      ],
    })
    expect(tokenSeries(data, { hourly: false, buckets: ["2026-11-20", "2026-11-21"] })).toEqual([
      { bucket: "2026-11-20" },
      { bucket: "2026-11-21", codex: 500, "claude-code": 1_200 },
    ])
    expect(providersIn(data)).toEqual(["claude-code", "codex"])
  })

  it("uses the hours of a single day", () => {
    const data = report({
      byDay: [{ day: "2026-11-22", provider: "kiro", amount: amount(900) }],
      byHour: [{ hour: "2026-11-22T09", provider: "kiro", amount: amount(900) }],
    })
    expect(
      tokenSeries(data, { hourly: true, buckets: ["2026-11-22T08", "2026-11-22T09"] }),
    ).toEqual([{ bucket: "2026-11-22T08" }, { bucket: "2026-11-22T09", kiro: 900 }])
  })

  it("splits tokens by where they went, and the cache's share of the prompt", () => {
    const mixed: UsageAmount = {
      turns: 2,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 700,
      cacheCreationTokens: 200,
      costUsd: null,
    }
    expect(tokenMix(mixed).map((segment) => [segment.id, segment.tokens])).toEqual([
      ["cacheRead", 700],
      ["input", 100],
      ["cacheWrite", 200],
      ["output", 50],
    ])
    expect(cacheHitRate(mixed)).toBeCloseTo(0.7)
    expect(cacheHitRate(amount(0))).toBeUndefined()
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
    expect(formatShare(1, 400)).toBe("<1%")
    expect(formatShare(1, 3)).toBe("33%")
    expect(formatShare(0, 0)).toBe("0%")
    expect(formatSpan(45 * 60_000)).toBe("45m")
    expect(formatSpan(130 * 60_000)).toBe("2h 10m")
    expect(formatSpan(26 * 3_600_000)).toBe("1d 2h")
    expect(formatAgo(1_000, 31_000)).toBe("just now")
    expect(formatAgo(0, 5 * 60_000)).toBe("5m ago")
  })

  it("shows each account's last reading of its limits, with the pace and resets passed", () => {
    const now = Date.parse("2026-11-22T12:00:00.000Z")
    const accounts = limitAccounts(
      [
        {
          provider: "claude-code",
          accountKey: "",
          window: "seven_day",
          utilization: 30,
          resetsAt: "2026-11-25T12:00:00.000Z",
          sampledAt: "2026-11-22T11:50:00.000Z",
        },
        {
          provider: "claude-code",
          accountKey: "",
          window: "five_hour",
          utilization: 80,
          resetsAt: "2026-11-22T13:00:00.000Z",
          sampledAt: "2026-11-22T11:55:00.000Z",
        },
        {
          provider: "codex",
          accountKey: "work",
          window: "five_hour",
          utilization: 95,
          resetsAt: "2026-11-22T11:00:00.000Z",
          sampledAt: "2026-11-22T09:00:00.000Z",
        },
      ],
      now,
    )
    expect(accounts.map((account) => account.key)).toEqual(["claude-code:", "codex:work"])
    const [claude, codex] = accounts
    expect(claude?.readAt).toBe(Date.parse("2026-11-22T11:55:00.000Z"))
    expect(claude?.windows.map((window) => window.window)).toEqual(["five_hour", "seven_day"])
    expect(claude?.windows[0]?.used).toBe(80)
    expect(claude?.windows[0]?.elapsed).toBeCloseTo(0.8)
    expect(claude?.windows[1]?.elapsed).toBeCloseTo(4 / 7)
    expect(codex?.windows[0]).toEqual({
      window: "five_hour",
      used: 0,
      resetsAt: undefined,
      elapsed: undefined,
      resetSince: true,
    })
  })
})
