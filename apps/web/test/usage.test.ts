import { describe, expect, it } from "vitest"
import {
  contextPercentUsed,
  formatTokens,
  planHeadline,
  planRows,
  usageLevel,
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
  const row = (label: string, utilization: number) => ({ label, utilization, resetsAt: null })

  it("is the fullest window above 50%, and nothing while all are at most half used", () => {
    expect(planHeadline([row("5-hour limit", 50), row("7-day limit", 10)])).toBeUndefined()
    expect(
      planHeadline([row("5-hour limit", 62), row("7-day limit", 30), row("Fable 7-day limit", 80)])
        ?.label,
    ).toBe("Fable 7-day limit")
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
