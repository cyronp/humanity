import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { TestClock } from "effect/testing"
import type { ReportedAccount } from "../src/claude/account.ts"
import { ClaudeCode, ClaudeProbeFailed, type ProbeResult } from "../src/claude/ClaudeCode.ts"
import { ClaudeAccountService } from "../src/services/ClaudeAccountService.ts"

const SUBSCRIPTION: ReportedAccount = { email: "dev@example.com", subscriptionType: "pro" }
const SIGNED_OUT: ReportedAccount = { tokenSource: "none" }
const MODELS = [
  { value: "default", displayName: "Default (recommended)", description: "Opus for this plan" },
  { value: "sonnet", displayName: "Sonnet", description: "Fast everyday model" },
]

/** A scripted Claude Code that reports `account` and counts how often it was started. */
const scripted = (account: Ref.Ref<ReportedAccount | "fail">, probes: Ref.Ref<number>) =>
  ClaudeCode.layerTest(
    Effect.gen(function* () {
      yield* Ref.update(probes, (n) => n + 1)
      const current = yield* Ref.get(account)
      if (current === "fail") {
        return yield* new ClaudeProbeFailed({ reason: "spawn claude ENOENT" })
      }
      return { cliVersion: "2.1.321", account: current, models: MODELS } satisfies ProbeResult
    }),
    { configDir: "/home/me/.claude", bundledExecutable: "/sdk/claude" },
  )

const setup = (initial: ReportedAccount | "fail") =>
  Effect.gen(function* () {
    const account = yield* Ref.make<ReportedAccount | "fail">(initial)
    const probes = yield* Ref.make(0)
    const service = yield* ClaudeAccountService.pipe(
      Effect.provide(ClaudeAccountService.layer.pipe(Layer.provide(scripted(account, probes)))),
    )
    return { account, probes, service }
  })

describe("ClaudeAccountService", () => {
  it.effect("reports the subscription with where its login lives", () =>
    Effect.gen(function* () {
      const { service } = yield* setup(SUBSCRIPTION)
      const status = yield* service.status({ refresh: false })
      assert.strictEqual(status.connection._tag, "Connected")
      assert.strictEqual(status.cliVersion, "2.1.321")
      assert.strictEqual(status.configDir, "/home/me/.claude")
      assert.strictEqual(status.bundledExecutable, "/sdk/claude")
      assert.deepStrictEqual(status.models, MODELS)
    }),
  )

  it.effect("starts Claude Code once for concurrent and repeated checks", () =>
    Effect.gen(function* () {
      const { probes, service } = yield* setup(SUBSCRIPTION)
      yield* Effect.all([service.status({ refresh: false }), service.status({ refresh: false })], {
        concurrency: "unbounded",
      })
      yield* service.status({ refresh: false })
      assert.strictEqual(yield* Ref.get(probes), 1)
    }),
  )

  it.effect("checks again on refresh, so a fresh login shows up right away", () =>
    Effect.gen(function* () {
      const { account, probes, service } = yield* setup(SIGNED_OUT)
      assert.strictEqual((yield* service.status({ refresh: false })).connection._tag, "SignedOut")

      yield* Ref.set(account, SUBSCRIPTION)
      const status = yield* service.status({ refresh: true })
      assert.strictEqual(status.connection._tag, "Connected")
      assert.strictEqual(yield* Ref.get(probes), 2)
    }),
  )

  it.effect("re-checks a signed-out status after a few seconds without a refresh", () =>
    Effect.gen(function* () {
      const { account, service } = yield* setup(SIGNED_OUT)
      yield* service.status({ refresh: false })
      yield* Ref.set(account, SUBSCRIPTION)

      yield* TestClock.adjust("5 seconds")
      assert.strictEqual((yield* service.status({ refresh: false })).connection._tag, "SignedOut")
      yield* TestClock.adjust("6 seconds")
      assert.strictEqual((yield* service.status({ refresh: false })).connection._tag, "Connected")
    }),
  )

  it.effect("keeps a working login cached for minutes", () =>
    Effect.gen(function* () {
      const { probes, service } = yield* setup(SUBSCRIPTION)
      yield* service.status({ refresh: false })
      yield* TestClock.adjust("4 minutes")
      yield* service.status({ refresh: false })
      assert.strictEqual(yield* Ref.get(probes), 1)
    }),
  )

  it.effect("turns a Claude Code that cannot start into an Unavailable status, not a failure", () =>
    Effect.gen(function* () {
      const { service } = yield* setup("fail")
      const status = yield* service.status({ refresh: false })
      assert.deepStrictEqual(status.connection, {
        _tag: "Unavailable",
        reason: "spawn claude ENOENT",
      })
      assert.isNull(status.cliVersion)
      assert.deepStrictEqual(status.models, [])
    }),
  )
})
