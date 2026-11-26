import {
  type AgentProvider,
  type PlanWindowName,
  totalTokens,
  type UsageAmount,
  type UsageReport,
} from "@humanity/contracts"
import { useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import { registry } from "@/lib/registry"

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

export interface UsageRange {
  readonly from: string
  readonly to: string
  readonly days: ReadonlyArray<string>
  readonly hourly: boolean
  readonly buckets: ReadonlyArray<string>
}

export const rangeOf = (id: UsageRangeId, now: Date): UsageRange => {
  const range = USAGE_RANGES.find((each) => each.id === id) ?? USAGE_RANGES[1]
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range.days - 1))
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const days = Array.from({ length: range.days }, (_, index) =>
    localDay(new Date(start.getTime() + index * DAY_MS + DAY_MS / 2)),
  )
  const hourly = range.days === 1
  const buckets = hourly
    ? Array.from({ length: 24 }, (_, hour) => `${days[0] ?? ""}T${String(hour).padStart(2, "0")}`)
    : days
  return { from: start.toISOString(), to: end.toISOString(), days, hourly, buckets }
}

const RANGE_KEY = "humanity.usage.range"

export const storedRange = (): UsageRangeId => {
  try {
    const value = window.localStorage.getItem(RANGE_KEY)
    return USAGE_RANGES.find((each) => each.id === value)?.id ?? "week"
  } catch {
    return "week"
  }
}

export const storeRange = (id: UsageRangeId): void => {
  try {
    window.localStorage.setItem(RANGE_KEY, id)
  } catch {}
}

export type BucketRow = { readonly bucket: string } & Partial<Record<AgentProvider, number>>

export const tokenSeries = (
  report: UsageReport,
  range: Pick<UsageRange, "hourly" | "buckets">,
): ReadonlyArray<BucketRow> => {
  const entries = range.hourly
    ? report.byHour.map((entry) => ({ bucket: entry.hour, ...entry }))
    : report.byDay.map((entry) => ({ bucket: entry.day, ...entry }))
  return range.buckets.map((bucket) => {
    const row: Record<string, number | string> = { bucket }
    for (const entry of entries) {
      if (entry.bucket !== bucket) continue
      row[entry.provider] =
        ((row[entry.provider] as number | undefined) ?? 0) + totalTokens(entry.amount)
    }
    return row as BucketRow
  })
}

export const providersIn = (report: UsageReport): ReadonlyArray<AgentProvider> =>
  report.byProvider.filter((row) => row.amount.turns > 0).map((row) => row.provider)

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

export const formatShare = (part: number, whole: number): string => {
  const share = shareOf(part, whole) * 100
  return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`
}

export interface MixSegment {
  readonly id: "input" | "cacheRead" | "cacheWrite" | "output"
  readonly label: string
  readonly tokens: number
}

export const tokenMix = (amount: UsageAmount): ReadonlyArray<MixSegment> => [
  { id: "cacheRead", label: "Read from cache", tokens: amount.cacheReadTokens },
  { id: "input", label: "Input", tokens: amount.inputTokens },
  { id: "cacheWrite", label: "Written to cache", tokens: amount.cacheCreationTokens },
  { id: "output", label: "Output", tokens: amount.outputTokens },
]

export const cacheHitRate = (amount: UsageAmount): number | undefined => {
  const prompt = amount.inputTokens + amount.cacheReadTokens + amount.cacheCreationTokens
  return prompt <= 0 ? undefined : amount.cacheReadTokens / prompt
}

const WINDOW_MS: Record<PlanWindowName, number> = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * DAY_MS,
}

export const WINDOW_LABEL: Record<PlanWindowName, string> = {
  five_hour: "5-hour",
  seven_day: "7-day",
}

export interface LimitWindow {
  readonly window: PlanWindowName
  readonly used: number
  readonly resetsAt: number | undefined
  readonly elapsed: number | undefined
  readonly resetSince: boolean
}

export interface LimitAccount {
  readonly key: string
  readonly provider: AgentProvider
  readonly accountKey: string
  readonly readAt: number
  readonly windows: ReadonlyArray<LimitWindow>
}

export const limitAccounts = (
  limits: UsageReport["limits"],
  now: number,
): ReadonlyArray<LimitAccount> => {
  const accounts = new Map<string, LimitAccount & { windows: Array<LimitWindow> }>()
  for (const sample of limits) {
    const key = `${sample.provider}:${sample.accountKey}`
    const readAt = Date.parse(sample.sampledAt)
    const parsed = sample.resetsAt === null ? Number.NaN : Date.parse(sample.resetsAt)
    const resetsAt = Number.isNaN(parsed) ? undefined : parsed
    const resetSince = resetsAt !== undefined && resetsAt <= now
    const account = accounts.get(key) ?? {
      key,
      provider: sample.provider,
      accountKey: sample.accountKey,
      readAt,
      windows: [],
    }
    account.windows.push({
      window: sample.window,
      used: resetSince ? 0 : Math.max(0, Math.min(100, sample.utilization)),
      resetsAt: resetSince ? undefined : resetsAt,
      elapsed:
        resetsAt === undefined || resetSince
          ? undefined
          : Math.max(0, Math.min(1, 1 - (resetsAt - now) / WINDOW_MS[sample.window])),
      resetSince,
    })
    accounts.set(key, { ...account, readAt: Math.max(account.readAt, readAt) })
  }
  return [...accounts.values()].map((account) => ({
    ...account,
    windows: [...account.windows].sort((a, b) => WINDOW_MS[a.window] - WINDOW_MS[b.window]),
  }))
}

export const formatSpan = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`
}

export const formatAgo = (at: number, now: number): string =>
  now - at < 60_000 ? "just now" : `${formatSpan(now - at)} ago`

const openAtom = Atom.make(false).pipe(Atom.keepAlive)

export const openUsage = (): void => registry.set(openAtom, true)

export const closeUsage = (): void => registry.set(openAtom, false)

export const useUsageOpen = (): boolean => useAtomValue(openAtom)
