import { describe, expect, it } from "vitest"
import { effortLabel, effortOptionsFor } from "@/features/providers/effort"

describe("effortOptionsFor", () => {
  it("offers every level when the model does not say which it takes", () => {
    expect(effortOptionsFor(undefined).map((option) => option.value)).toEqual([
      "default",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
  })

  it("offers Default and the model's own levels", () => {
    expect(effortOptionsFor(["low", "high"]).map((option) => option.value)).toEqual([
      "default",
      "low",
      "high",
    ])
  })

  it("offers only Default to a model that takes no effort", () => {
    expect(effortOptionsFor([]).map((option) => option.value)).toEqual(["default"])
  })
})

describe("effortLabel", () => {
  it("names the level, and Default for none", () => {
    expect(effortLabel("xhigh")).toBe("Extra high")
    expect(effortLabel(null)).toBe("Default")
  })
})
