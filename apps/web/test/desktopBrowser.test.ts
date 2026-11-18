import { describe, expect, it } from "vitest"
import { NO_CRASHES, planCrashRecovery } from "@/features/browser/desktop"

describe("planCrashRecovery", () => {
  it("reloads after 250 ms, 500 ms, then 1 s, then leaves it to the human", () => {
    let state = NO_CRASHES
    const delays: Array<number> = []
    for (let crash = 0; crash < 3; crash++) {
      const plan = planCrashRecovery(state, 1_000 + crash)
      if (plan === undefined) throw new Error("expected a reload")
      delays.push(plan.delayMs)
      state = plan.state
    }
    expect(delays).toEqual([250, 500, 1000])
    expect(planCrashRecovery(state, 2_000)).toBeUndefined()
  })

  it("starts over once 30 s have passed", () => {
    const tired = { attempts: 3, since: 0 }
    expect(planCrashRecovery(tired, 30_000)?.delayMs).toBe(250)
  })
})
