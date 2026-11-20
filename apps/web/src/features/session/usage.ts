import {
  type AccountUsage,
  type AgentProvider,
  type ContextUsage,
  type PlanUsage,
  type PlanWindow,
  PROVIDER_NAMES,
} from "@humanity/contracts"

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

/** How full a window is now: `null` without one, 0 once it has reset. */
export const windowUsed = (window: PlanWindow | null, now: Date): number | null =>
  window === null ? null : stillOpen(window, now) ? window.utilization : 0

/** An account by its provider's name, and by its own only where the provider has several. */
export const accountLabel = (
  provider: AgentProvider,
  name: string | undefined,
  accountsOfProvider: number,
): string =>
  name === undefined || accountsOfProvider < 2
    ? PROVIDER_NAMES[provider]
    : `${PROVIDER_NAMES[provider]} · ${name}`

/** How many other accounts the plan usage lists before "Show more". */
export const OTHER_ACCOUNTS_SHOWN = 3

/** The other accounts, labelled, in the order the daemon lists them. */
export const otherAccountRows = (
  accounts: ReadonlyArray<AccountUsage>,
): ReadonlyArray<AccountUsage & { readonly label: string }> =>
  accounts.map((account) => ({
    ...account,
    label: accountLabel(
      account.provider,
      account.name,
      accounts.filter((other) => other.provider === account.provider).length,
    ),
  }))

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

const LIMIT_WORDS =
  /usage limit|rate limit|rate_limit|quota|limit reached|limit exceeded|out of credits|too many requests|\b429\b/i

/**
 * Whether the agent stopped on its plan's limit: its error says so, or a limit the provider
 * reported is full.
 */
export const hitUsageLimit = (error: string, plan: PlanUsage | null, now: Date): boolean =>
  LIMIT_WORDS.test(error) ||
  planRows(plan, now).some((row) => row.blocking && row.utilization >= 100)
