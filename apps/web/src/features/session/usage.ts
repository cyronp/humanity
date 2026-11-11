import type { ContextUsage, PlanUsage, PlanWindow } from "@humanity/contracts"

/** How close a meter is to its limit: quiet up to 50% used, then yellow, orange and red. */
export type UsageLevel = "ok" | "notice" | "warning" | "critical"

/** Above 50% is a notice, above 75% a warning, from 90% critical. */
export const usageLevel = (percentUsed: number): UsageLevel =>
  percentUsed >= 90 ? "critical" : percentUsed > 75 ? "warning" : percentUsed > 50 ? "notice" : "ok"

/** How much of the context window is used, 0 to 100. */
export const contextPercentUsed = (context: ContextUsage): number =>
  context.maxTokens <= 0
    ? 0
    : Math.min(100, Math.max(0, (context.usedTokens / context.maxTokens) * 100))

/** One of the plan's windows, ready to show. */
export interface PlanRow extends PlanWindow {
  readonly label: string
}

const stillOpen = (window: PlanWindow, now: Date): boolean => {
  if (window.resetsAt === null) return true
  const resets = Date.parse(window.resetsAt)
  return Number.isNaN(resets) || resets > now.getTime()
}

/**
 * The plan's windows in the order they are shown: 5-hour, 7-day, then each
 * model's own weekly window. A window that has reset since the agent reported
 * it is left out, because its number is no longer true.
 */
export const planRows = (plan: PlanUsage | null, now: Date): ReadonlyArray<PlanRow> => {
  if (plan === null) return []
  const rows: Array<PlanRow> = [
    ...(plan.fiveHour === null ? [] : [{ label: "5-hour limit", ...plan.fiveHour }]),
    ...(plan.sevenDay === null ? [] : [{ label: "7-day limit", ...plan.sevenDay }]),
    ...plan.models.map(({ name, ...window }) => ({ label: `${name} 7-day limit`, ...window })),
  ]
  return rows.filter((row) => stillOpen(row, now))
}

/** The window worth the human's attention at a glance: the fullest one above 50%, if any. */
export const planHeadline = (rows: ReadonlyArray<PlanRow>): PlanRow | undefined =>
  rows.reduce<PlanRow | undefined>(
    (fullest, row) =>
      row.utilization > 50 && row.utilization > (fullest?.utilization ?? 0) ? row : fullest,
    undefined,
  )

/** `84k`, `1.2M`: token counts short enough for a tooltip. */
export const formatTokens = (tokens: number): string =>
  tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : tokens >= 1_000
      ? `${Math.round(tokens / 1_000)}k`
      : String(tokens)
