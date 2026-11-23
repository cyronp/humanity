import {
  type AgentProvider,
  totalTokens,
  type UsageAmount,
  type UsageReport,
} from "@humanity/contracts"
import { useSyncExternalStore } from "react"

export const USAGE_RANGES = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "7 days", days: 7 },
  { id: "month", label: "30 days", days: 30 },
  { id: "quarter", label: "90 days", days: 90 },
] as const
export type UsageRangeId = (typeof USAGE_RANGES)[number]["id"]

const DAY_MS = 86_400_000

const localDay = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const rangeOf = (
  id: UsageRangeId,
  now: Date,
): { readonly from: string; readonly to: string; readonly days: ReadonlyArray<string> } => {
  const range = USAGE_RANGES.find((each) => each.id === id) ?? USAGE_RANGES[1]
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range.days - 1))
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const days = Array.from({ length: range.days }, (_, index) =>
    localDay(new Date(start.getTime() + index * DAY_MS + DAY_MS / 2)),
  )
  return { from: start.toISOString(), to: end.toISOString(), days }
}

export type DailyRow = { readonly day: string } & Partial<Record<AgentProvider, number>>

export const dailySeries = (
  report: UsageReport,
  days: ReadonlyArray<string>,
): ReadonlyArray<DailyRow> =>
  days.map((day) => {
    const row: Record<string, number | string> = { day }
    for (const entry of report.byDay) {
      if (entry.day !== day) continue
      row[entry.provider] =
        ((row[entry.provider] as number | undefined) ?? 0) + totalTokens(entry.amount)
    }
    return row as DailyRow
  })

export const providersIn = (report: UsageReport): ReadonlyArray<AgentProvider> => [
  ...new Set(report.byDay.map((entry) => entry.provider)),
]

export const formatCount = (value: number): string => {
  if (value < 1_000) return String(Math.round(value))
  if (value < 1_000_000)
    return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 2 : 1).replace(/\.?0+$/, "")}M`
}

export const formatCost = (amount: UsageAmount): string | undefined =>
  amount.costUsd === null
    ? undefined
    : amount.costUsd < 0.01 && amount.costUsd > 0
      ? "<$0.01"
      : `$${amount.costUsd.toFixed(2)}`

export const shareOf = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.max(0, Math.min(1, part / whole))

export interface PlanPoint {
  readonly at: number
  readonly utilization: number
}

export const planSeries = (
  report: UsageReport,
): ReadonlyArray<{
  readonly key: string
  readonly provider: AgentProvider
  readonly accountKey: string
  readonly points: ReadonlyArray<PlanPoint>
}> => {
  const series = new Map<
    string,
    { provider: AgentProvider; accountKey: string; points: Array<PlanPoint> }
  >()
  for (const sample of report.plan) {
    if (sample.window !== "five_hour") continue
    const key = `${sample.provider}:${sample.accountKey}`
    const entry = series.get(key) ?? {
      provider: sample.provider,
      accountKey: sample.accountKey,
      points: [],
    }
    entry.points.push({ at: Date.parse(sample.sampledAt), utilization: sample.utilization })
    series.set(key, entry)
  }
  return [...series.entries()].map(([key, entry]) => ({ key, ...entry }))
}

let open = false
const listeners = new Set<() => void>()

export const openUsage = (): void => {
  open = true
  for (const listener of listeners) listener()
}

export const closeUsage = (): void => {
  open = false
  for (const listener of listeners) listener()
}

export const useUsageOpen = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => open,
  )
