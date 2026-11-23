import type { HandoffPreview } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { changedExclusions, excludedOf, toggledExclusion } from "@/features/chat/handoffTrim"

const preview: HandoffPreview = {
  text: "<humanity-handoff>…</humanity-handoff>",
  tokens: 40,
  included: 2,
  omitted: 1,
  cut: 1,
  editable: true,
  entries: [
    { index: 1, kind: "human", text: "Human: one", state: "included" },
    { index: 2, kind: "agent", text: "Agent (Codex): two", state: "omitted" },
    { index: 3, kind: "human", text: "Human: three", state: "cut" },
    { index: 4, kind: "agent", text: "Agent (Codex): four", state: "included" },
  ],
}

describe("handoff trimming", () => {
  it("starts from the entries the human already cut", () => {
    expect([...excludedOf(preview)]).toEqual([3])
    expect(excludedOf(null).size).toBe(0)
  })

  it("toggles an entry and knows when the choice differs from what was applied", () => {
    const start = excludedOf(preview)
    expect(changedExclusions(preview, start)).toBe(false)
    const more = toggledExclusion(start, 2)
    expect([...more].toSorted()).toEqual([2, 3])
    expect(changedExclusions(preview, more)).toBe(true)
    expect(changedExclusions(preview, toggledExclusion(more, 2))).toBe(false)
    expect(changedExclusions(preview, toggledExclusion(start, 3))).toBe(true)
  })
})
