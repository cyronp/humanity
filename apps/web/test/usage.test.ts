import { describe, expect, it } from "vitest"
import {
  accountLabel,
  contextPercentUsed,
  formatTokens,
  hitUsageLimit,
  otherAccountRows,
  planHeadline,
  planRows,
  usageLevel,
  windowUsed,
} from "@/features/session/usage"

describe("usageLevel", () => {
  it("turns yellow above 50%, orange above 75% and red from 90%", () => {
    expect(usageLevel(0)).toBe("ok")
    expect(usageLevel(50)).toBe("ok")
    expect(usageLevel(50.1)).toBe("notice")
    expect(usageLevel(75)).toBe("notice")
    expect(usageLevel(75.1)).toBe("warning")
    expect(usageLevel(89.9)).toBe("warning")
    expect(usageLevel(90)).toBe("critical")
    expect(usageLevel(100)).toBe("critical")
  })
})

describe("contextPercentUsed", () => {
  it("is the share of the window in use, kept between 0 and 100", () => {
    expect(contextPercentUsed({ usedTokens: 50_000, maxTokens: 200_000 })).toBe(25)
    expect(contextPercentUsed({ usedTokens: 300_000, maxTokens: 200_000 })).toBe(100)
    expect(contextPercentUsed({ usedTokens: 10, maxTokens: 0 })).toBe(0)
  })
})

describe("planRows", () => {
  const now = new Date("2026-11-11T12:00:00.000Z")
  const later = "2026-11-11T13:00:00.000Z"

  it("lists the 5-hour window, the 7-day window, then each model's", () => {
    const rows = planRows(
      {
        fiveHour: { utilization: 20, resetsAt: later },
        sevenDay: { utilization: 40, resetsAt: null },
        models: [{ name: "Fable", utilization: 60, resetsAt: later }],
      },
      now,
    )
    expect(rows.map((row) => row.label)).toEqual([
      "5-hour limit",
      "7-day limit",
      "Fable 7-day limit",
    ])
    expect(rows.map((row) => row.utilization)).toEqual([20, 40, 60])
    expect(rows.map((row) => row.blocking)).toEqual([true, true, false])
  })

  it("has nothing to list without plan limits or for windows that were not reported", () => {
    expect(planRows(null, now)).toEqual([])
    expect(planRows({ fiveHour: null, sevenDay: null, models: [] }, now)).toEqual([])
  })

  it("leaves out a window that has reset since it was reported", () => {
    const rows = planRows(
      {
        fiveHour: { utilization: 95, resetsAt: "2026-11-11T11:00:00.000Z" },
        sevenDay: { utilization: 40, resetsAt: later },
        models: [],
      },
      now,
    )
    expect(rows.map((row) => row.label)).toEqual(["7-day limit"])
  })
})

describe("planHeadline", () => {
  const row = (label: string, utilization: number, blocking = true) => ({
    label,
    blocking,
    utilization,
    resetsAt: null,
  })

  it("is the fullest window above 50%, and nothing while all are at most half used", () => {
    expect(planHeadline([row("5-hour limit", 50), row("7-day limit", 10)])).toBeUndefined()
    expect(planHeadline([row("5-hour limit", 62), row("7-day limit", 80)])?.label).toBe(
      "7-day limit",
    )
  })

  it("is never a model's own window, which does not stop the agent", () => {
    const fable = row("Fable 7-day limit", 95, false)
    expect(planHeadline([row("5-hour limit", 62), row("7-day limit", 30), fable])?.label).toBe(
      "5-hour limit",
    )
    expect(planHeadline([row("5-hour limit", 20), fable])).toBeUndefined()
  })
})

describe("formatTokens", () => {
  it("shortens thousands and millions", () => {
    expect(formatTokens(950)).toBe("950")
    expect(formatTokens(84_300)).toBe("84k")
    expect(formatTokens(1_000_000)).toBe("1M")
    expect(formatTokens(1_250_000)).toBe("1.3M")
  })
})

describe("hitUsageLimit", () => {
  const now = new Date("2026-11-20T12:00:00.000Z")
  const window = (utilization: number) => ({ utilization, resetsAt: "2026-11-20T15:00:00.000Z" })

  it("reads a limit from the agent's error", () => {
    expect(hitUsageLimit("Claude AI usage limit reached|1763600000", null, now)).toBe(true)
    expect(hitUsageLimit("429 Too Many Requests", null, now)).toBe(true)
    expect(hitUsageLimit("You exceeded your current quota", null, now)).toBe(true)
    expect(hitUsageLimit("The agent process stopped unexpectedly.", null, now)).toBe(false)
  })

  it("or from a full window of the plan", () => {
    const full = { fiveHour: window(100), sevenDay: window(40), models: [] }
    expect(hitUsageLimit("Request failed", full, now)).toBe(true)
    const room = { fiveHour: window(80), sevenDay: window(40), models: [] }
    expect(hitUsageLimit("Request failed", room, now)).toBe(false)
  })
})

describe("windowUsed", () => {
  const now = new Date("2026-01-01T12:00:00.000Z")
  it("reads a window that is still open, and counts one that reset as empty", () => {
    expect(windowUsed(null, now)).toBeNull()
    expect(windowUsed({ utilization: 81, resetsAt: "2026-01-01T15:00:00.000Z" }, now)).toBe(81)
    expect(windowUsed({ utilization: 81, resetsAt: null }, now)).toBe(81)
    expect(windowUsed({ utilization: 81, resetsAt: "2026-01-01T11:00:00.000Z" }, now)).toBe(0)
  })
})

describe("otherAccountRows", () => {
  const account = (
    provider: "claude-code" | "codex" | "kiro",
    accountId: string,
    name: string,
  ) => ({
    provider,
    accountId,
    name,
    plan: null,
    unavailable: null,
  })

  it("names an account only where its provider has several", () => {
    const rows = otherAccountRows([
      account("codex", "default", "Default login"),
      account("codex", "work", "Work"),
      account("kiro", "default", "Default login"),
    ])
    expect(rows.map((row) => row.label)).toEqual(["Codex · Default login", "Codex · Work", "Kiro"])
  })

  it("names the thread's own account the same way", () => {
    expect(accountLabel("claude-code", "Personal", 2)).toBe("Claude Code · Personal")
    expect(accountLabel("claude-code", "Personal", 1)).toBe("Claude Code")
    expect(accountLabel("claude-code", undefined, 3)).toBe("Claude Code")
  })
})
