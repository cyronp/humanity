import { describe, expect, it } from "vitest"
import { formatTimeAgo } from "@/lib/elapsed"

const now = Date.parse("2026-11-11T12:00:00.000Z")
const ago = (seconds: number) => formatTimeAgo(new Date(now - seconds * 1000).toISOString(), now)

describe("formatTimeAgo", () => {
  it("spells out the largest whole unit, like VS Code's branch picker", () => {
    expect(ago(20)).toBe("just now")
    expect(ago(41 * 60)).toBe("41 minutes ago")
    expect(ago(7 * 3600)).toBe("7 hours ago")
    expect(ago(26 * 3600)).toBe("yesterday")
    expect(ago(3 * 7 * 24 * 3600)).toBe("3 weeks ago")
    expect(ago(400 * 24 * 3600)).toBe("last year")
  })

  it("prints nothing for a date it cannot read", () => {
    expect(formatTimeAgo("", now)).toBe("")
  })
})
