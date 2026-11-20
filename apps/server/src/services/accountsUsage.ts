import type { AccountUsage, AgentProvider, PlanUsage } from "@humanity/contracts"
import { Clock, Duration, Effect, Result, Semaphore } from "effect"

export interface UsageAccount {
  readonly id: string
  readonly name: string
  readonly connected: boolean
}

/** One provider's accounts, and how to read an account's plan limits. */
export interface UsageSource {
  readonly provider: AgentProvider
  readonly accounts: Effect.Effect<ReadonlyArray<UsageAccount>>
  /** Absent for a provider that reports no plan limits. */
  readonly plan?: (
    accountId: string,
  ) => Effect.Effect<PlanUsage | undefined, { readonly reason: string }>
}

/** Reading an account's limits starts its CLI, so a reading is kept this long. */
export const USAGE_FRESH_FOR = Duration.minutes(2)
const READ_CONCURRENCY = 3

/**
 * The plan usage of every signed-in account, apart from one provider's. One reading at a time,
 * so a second ask waits for the first and takes what it read.
 */
export const makeAccountsUsage = (sources: ReadonlyArray<UsageSource>) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1)
    const readings = new Map<string, { readonly at: number; readonly usage: AccountUsage }>()

    const usageOf = (source: UsageSource, account: UsageAccount, refresh: boolean) =>
      Effect.gen(function* () {
        const base = { provider: source.provider, accountId: account.id, name: account.name }
        if (source.plan === undefined) {
          return { ...base, plan: null, unavailable: null } satisfies AccountUsage
        }
        const key = `${source.provider}/${account.id}`
        const now = yield* Clock.currentTimeMillis
        const known = readings.get(key)
        if (
          !refresh &&
          known !== undefined &&
          now - known.at < Duration.toMillis(USAGE_FRESH_FOR)
        ) {
          return { ...known.usage, name: account.name }
        }
        const result = yield* Effect.result(source.plan(account.id))
        const usage: AccountUsage = Result.isSuccess(result)
          ? { ...base, plan: result.success ?? null, unavailable: null }
          : { ...base, plan: null, unavailable: result.failure.reason }
        readings.set(key, { at: now, usage })
        return usage
      })

    return (exclude: AgentProvider, refresh: boolean): Effect.Effect<ReadonlyArray<AccountUsage>> =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const listed = yield* Effect.forEach(
            sources.filter((source) => source.provider !== exclude),
            (source) =>
              Effect.map(source.accounts, (accounts) =>
                accounts
                  .filter((account) => account.connected)
                  .map((account) => ({ source, account })),
              ),
            { concurrency: "unbounded" },
          )
          return yield* Effect.forEach(
            listed.flat(),
            ({ source, account }) => usageOf(source, account, refresh),
            { concurrency: READ_CONCURRENCY },
          )
        }),
      )
  })
