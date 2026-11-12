import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk"
import type { PlanUsage, PlanWindow } from "@humanity/contracts"

/** A plan window as Claude Code reports it; one without a percentage says nothing. */
const planWindow = (
  window:
    { readonly utilization: number | null; readonly resets_at: string | null } | null | undefined,
): PlanWindow | null =>
  typeof window?.utilization === "number"
    ? { utilization: window.utilization, resetsAt: window.resets_at ?? null }
    : null

/**
 * The plan's rate-limit windows from Claude Code's usage answer; `undefined`
 * when the login has none (an API key) or Claude Code could not fetch them.
 */
export const readPlanUsage = (usage: SDKControlGetUsageResponse): PlanUsage | undefined => {
  const limits = usage.rate_limits
  if (!limits) return undefined
  return {
    fiveHour: planWindow(limits.five_hour),
    sevenDay: planWindow(limits.seven_day),
    models: (limits.model_scoped ?? []).flatMap((model) => {
      const window = planWindow(model)
      return window === null ? [] : [{ name: model.display_name, ...window }]
    }),
  }
}
