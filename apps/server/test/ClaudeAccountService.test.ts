import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { TestClock } from "effect/testing"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ReportedAccount } from "../src/claude/account.ts"
import { ClaudeCode, ClaudeProbeFailed, type ProbeResult } from "../src/claude/ClaudeCode.ts"
import { ClaudeAccountService } from "../src/services/ClaudeAccountService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

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
    const home = yield* tempDir()
    const service = yield* ClaudeAccountService.pipe(
      Effect.provide(
        ClaudeAccountService.layer.pipe(
          Layer.provide(scripted(account, probes)),
          Layer.provide(baseLayer(home)),
        ),
      ),
    )
    return { account, probes, service }
  })

/** Runs `body` with a service whose database stays open until the body is done. */
const withService = <A, E, R>(
  body: (service: ClaudeAccountService["Service"]) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const account = yield* Ref.make<ReportedAccount | "fail">(SUBSCRIPTION)
    const probes = yield* Ref.make(0)
    const home = yield* tempDir()
    const run = Effect.gen(function* () {
      return yield* body(yield* ClaudeAccountService)
    })
    return yield* run.pipe(
      Effect.provide(
        ClaudeAccountService.layer.pipe(
          Layer.provide(scripted(account, probes)),
          Layer.provide(baseLayer(home)),
        ),
      ),
    )
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

  it.effect(
    "adds an account with its own config folder and runs new threads as the active one",
    () =>
      Effect.gen(function* () {
        const home = yield* tempDir()
        const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
        // The default login is signed in; a folder of an added account is not.
        const claude = ClaudeCode.layerTest((configDir) =>
          Effect.as(
            Ref.update(probed, (dirs) => [...dirs, configDir]),
            {
              cliVersion: "2.1.321",
              account: configDir === undefined ? SUBSCRIPTION : SIGNED_OUT,
              models: MODELS,
            } satisfies ProbeResult,
          ),
        )
        const layer = ClaudeAccountService.layer.pipe(
          Layer.provide(claude),
          Layer.provide(baseLayer(home)),
        )

        const work = yield* Effect.gen(function* () {
          const service = yield* ClaudeAccountService
          const work = yield* service.add("  Work  ")
          assert.strictEqual(work.name, "Work")
          assert.isFalse(work.active)
          assert.strictEqual(work.status.connection._tag, "SignedOut")
          assert.strictEqual(work.status.configDir, join(home, "accounts", work.id))
          assert.deepStrictEqual(yield* Ref.get(probed), [work.status.configDir])

          assert.strictEqual(
            (yield* service.status({ refresh: false })).connection._tag,
            "Connected",
          )
          assert.isUndefined(yield* service.configDirFor(yield* service.activeId))

          yield* service.setActive(work.id)
          assert.strictEqual(
            (yield* service.status({ refresh: false })).connection._tag,
            "SignedOut",
          )
          assert.strictEqual(yield* service.configDirFor(work.id), work.status.configDir)
          return work
        }).pipe(Effect.provide(layer))

        // A restarted daemon still knows the account and that it is the active one.
        yield* Effect.gen(function* () {
          const service = yield* ClaudeAccountService
          const accounts = yield* service.accounts({ refresh: false })
          assert.deepStrictEqual(
            accounts.map(({ id, name, isDefault, active }) => ({ id, name, isDefault, active })),
            [
              { id: "default", name: "Default login", isDefault: true, active: false },
              { id: work.id, name: "Work", isDefault: false, active: true },
            ],
          )

          yield* service.remove(work.id)
          assert.isFalse(existsSync(work.status.configDir))
          assert.strictEqual(yield* service.activeId, "default")
          assert.isUndefined(yield* service.configDirFor(work.id))
        }).pipe(Effect.provide(layer))
      }),
  )

  it.effect("runs an account on an existing folder and leaves the folder when it is removed", () =>
    withService((service) =>
      Effect.gen(function* () {
        const folder = yield* tempDir()
        writeFileSync(join(folder, ".credentials.json"), "{}")

        const personal = yield* service.add("Personal", `  ${folder}  `)
        assert.isTrue(personal.linkedFolder)
        assert.strictEqual(personal.status.configDir, folder)
        assert.strictEqual(yield* service.configDirFor(personal.id), folder)

        const listed = (yield* service.accounts({ refresh: false })).find(
          (account) => account.id === personal.id,
        )
        assert.isTrue(listed?.linkedFolder)

        yield* service.remove(personal.id)
        assert.isTrue(existsSync(join(folder, ".credentials.json")))
        assert.isUndefined(yield* service.configDirFor(personal.id))
      }),
    ),
  )

  it.effect("refuses a folder that is missing, a file, relative or already an account", () =>
    withService((service) =>
      Effect.gen(function* () {
        const folder = yield* tempDir()
        const file = join(folder, "settings.json")
        writeFileSync(file, "{}")

        const reasonFor = (configDir: string) =>
          Effect.map(Effect.flip(service.add("Personal", configDir)), (error) => error.message)

        assert.include(yield* reasonFor(join(folder, "missing")), "There is no folder at")
        assert.include(yield* reasonFor(file), "is a file, not a folder")
        assert.include(yield* reasonFor(".claude-personal"), "full path")
        assert.include(yield* reasonFor("   "), "Give the path")
        assert.include(yield* reasonFor("/home/me/.claude"), "default login")

        yield* service.add("Personal", folder)
        assert.include(yield* reasonFor(folder), "“Personal” already")
        assert.strictEqual((yield* service.accounts({ refresh: false })).length, 2)
      }),
    ),
  )

  it.effect("refuses a nameless account and never removes the default login", () =>
    Effect.gen(function* () {
      const { service } = yield* setup(SUBSCRIPTION)
      assert.strictEqual((yield* Effect.flip(service.add("   ")))._tag, "ClaudeAccountNameInvalid")
      assert.strictEqual(
        (yield* Effect.flip(service.remove("default")))._tag,
        "ClaudeAccountNotFound",
      )
      assert.strictEqual(
        (yield* Effect.flip(service.setActive("nope")))._tag,
        "ClaudeAccountNotFound",
      )
    }),
  )
})
