import { describe, expect, it } from "vitest"
import { neighbourStep, parseStep } from "@/features/onboarding/onboarding"

describe("onboarding steps", () => {
  it("parses only known steps", () => {
    expect(parseStep("connect")).toBe("connect")
    expect(parseStep("nope")).toBeUndefined()
    expect(parseStep(3)).toBeUndefined()
  })

  it("walks forward and back and stops at the ends", () => {
    expect(neighbourStep("welcome", 1)).toBe("connect")
    expect(neighbourStep("connect", 1)).toBe("repositories")
    expect(neighbourStep("ready", -1)).toBe("repositories")
    expect(neighbourStep("welcome", -1)).toBeUndefined()
    expect(neighbourStep("ready", 1)).toBeUndefined()
  })
})
