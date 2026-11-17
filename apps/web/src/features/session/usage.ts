import type { ContextUsage, PlanUsage, PlanWindow } from "@humanity/contracts"

export type UsageLevel = "ok" | "notice" | "warning" | "critical"

export const usageLevel = (percentUsed: number): UsageLevel =>
  percentUsed >= 90 ? "critical" : percentUsed > 75 ? "warning" : percentUsed > 50 ? "notice" : "ok"

export const contextPercentUsed = (context: ContextUsage): number =>
  context.maxTokens <= 0
    ? 0
    : Math.min(100, Math.max(0, (context.usedTokens / context.maxTokens) * 100))

export interface PlanRow extends PlanWindow {
  readonly label: string
  readonly blocking: boolean
}

const stillOpen = (window: PlanWindow, now: Date): boolean => {
  if (window.resetsAt === null) return true
  const resets = Date.parse(window.resetsAt)
  return Number.isNaN(resets) || resets > now.getTime()
}

export const planRows = (plan: PlanUsage | null, now: Date): ReadonlyArray<PlanRow> => {
  if (plan === null) return []
  const rows: Array<PlanRow> = [
    ...(plan.fiveHour === null
      ? []
      : [{ label: "5-hour limit", blocking: true, ...plan.fiveHour }]),
    ...(plan.sevenDay === null ? [] : [{ label: "7-day limit", blocking: true, ...plan.sevenDay }]),
    ...plan.models.map(({ name, ...window }) => ({
      label: `${name} 7-day limit`,
      blocking: false,
      ...window,
    })),
  ]
  return rows.filter((row) => stillOpen(row, now))
}

export const planHeadline = (rows: ReadonlyArray<PlanRow>): PlanRow | undefined =>
  rows.reduce<PlanRow | undefined>(
    (fullest, row) =>
      row.blocking && row.utilization > 50 && row.utilization > (fullest?.utilization ?? 0)
        ? row
        : fullest,
    undefined,
  )

export const formatTokens = (tokens: number): string =>
  tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : tokens >= 1_000
      ? `${Math.round(tokens / 1_000)}k`
      : String(tokens)
