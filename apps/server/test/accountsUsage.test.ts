import { assert, describe, it } from "@effect/vitest"
import type { PlanUsage } from "@humanity/contracts"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { makeAccountsUsage, type UsageSource } from "../src/services/accountsUsage.ts"

const plan = (fiveHour: number): PlanUsage => ({
  fiveHour: { utilization: fiveHour, resetsAt: "2099-01-01T00:00:00.000Z" },
  sevenDay: null,
  models: [],
})

const sources = (reads: Array<string>, failing = new Set<string>()): ReadonlyArray<UsageSource> => {
  const read =
    (provider: string, answers: Readonly<Record<string, PlanUsage | undefined>>) =>
    (accountId: string) =>
      Effect.suspend(() => {
        reads.push(`${provider}/${accountId}`)
        return failing.has(accountId)
          ? Effect.fail({ reason: "not signed in" })
          : Effect.succeed(answers[accountId])
      })
  return [
    {
      provider: "claude-code",
      accounts: Effect.succeed([
        { id: "default", name: "Default login", connected: true },
        { id: "work", name: "Work", connected: true },
      ]),
      plan: read("claude-code", { default: plan(62), work: plan(12) }),
    },
    {
      provider: "codex",
      accounts: Effect.succeed([
        { id: "default", name: "Default login", connected: true },
        { id: "old", name: "Old", connected: false },
        { id: "key", name: "API key", connected: true },
      ]),
      plan: read("codex", { default: plan(81), key: undefined }),
    },
    {
      provider: "kiro",
      accounts: Effect.succeed([{ id: "default", name: "Default login", connected: true }]),
    },
  ]
}

describe("accountsUsage", () => {
  it.effect("lists every signed-in account of the other providers", () =>
    Effect.gen(function* () {
      const reads: Array<string> = []
      const usage = yield* makeAccountsUsage(sources(reads, new Set(["work"])))

      const listed = yield* usage("codex", false)
      assert.deepStrictEqual(listed, [
        {
          provider: "claude-code",
          accountId: "default",
          name: "Default login",
          plan: plan(62),
          unavailable: null,
        },
        {
          provider: "claude-code",
          accountId: "work",
          name: "Work",
          plan: null,
          unavailable: "not signed in",
        },
        {
          provider: "kiro",
          accountId: "default",
          name: "Default login",
          plan: null,
          unavailable: null,
        },
      ])
      assert.deepStrictEqual(reads, ["claude-code/default", "claude-code/work"])

      const fromClaude = yield* usage("claude-code", false)
      assert.deepStrictEqual(
        fromClaude.map((account) => [account.provider, account.accountId, account.plan]),
        [
          ["codex", "default", plan(81)],
          ["codex", "key", null],
          ["kiro", "default", null],
        ],
      )
    }),
  )

  it.effect("reads an account again only on refresh or after a couple of minutes", () =>
    Effect.gen(function* () {
      const reads: Array<string> = []
      const usage = yield* makeAccountsUsage(sources(reads))

      yield* usage("codex", false)
      yield* usage("codex", false)
      assert.strictEqual(reads.length, 2)

      yield* usage("codex", true)
      assert.strictEqual(reads.length, 4)

      yield* TestClock.adjust("1 minute")
      yield* usage("codex", false)
      assert.strictEqual(reads.length, 4)

      yield* TestClock.adjust("2 minutes")
      yield* usage("codex", false)
      assert.strictEqual(reads.length, 6)
    }),
  )

  it.effect("reads once when asked twice at the same time", () =>
    Effect.gen(function* () {
      const reads: Array<string> = []
      const usage = yield* makeAccountsUsage(sources(reads))

      yield* Effect.all([usage("kiro", false), usage("kiro", false)], { concurrency: 2 })
      assert.deepStrictEqual(reads.toSorted(), [
        "claude-code/default",
        "claude-code/work",
        "codex/default",
        "codex/key",
      ])
    }),
  )
})
