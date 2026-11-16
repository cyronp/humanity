import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { AcpFailed } from "../src/acp/Connection.ts"
import { KIRO_ARGS, Kiro, type KiroProbe, kiroModels } from "../src/kiro/Kiro.ts"
import { KiroAccountService, classifyKiroAccount } from "../src/services/KiroAccountService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

const MODELS = [{ value: "claude-sonnet", displayName: "Claude Sonnet", description: "For tests" }]

/** A scripted Kiro: the default login is signed in, the folder of an added account is not. */
const scripted = (probed: Ref.Ref<ReadonlyArray<string | undefined>>) =>
  Kiro.layerTest({
    probe: (kiroHome) =>
      Effect.as(
        Ref.update(probed, (homes) => [...homes, kiroHome]),
        {
          cliVersion: "2.32.0",
          kiroHome: kiroHome ?? "/home/me/.kiro",
          signedIn: kiroHome === undefined,
          models: kiroHome === undefined ? MODELS : [],
        } satisfies KiroProbe,
      ),
  })

const layerOver = (home: string, probed: Ref.Ref<ReadonlyArray<string | undefined>>) =>
  KiroAccountService.layer.pipe(Layer.provide(scripted(probed)), Layer.provide(baseLayer(home)))

describe("Kiro (Beta)", () => {
  it("starts the CLI's ACP server on the V3 engine with CLI login, never autopilot", () => {
    assert.deepStrictEqual([...KIRO_ARGS], ["acp", "--agent-engine=v3", "--auth-method=cli"])
    assert.isFalse(KIRO_ARGS.some((arg) => arg.includes("autopilot") || arg.includes("trust")))
  })

  it("classifies a signed-in probe by its CLI version and a signed-out one as SignedOut", () => {
    assert.deepStrictEqual(
      classifyKiroAccount({ cliVersion: "2.32.0", kiroHome: "/k", signedIn: true, models: [] }),
      { _tag: "Connected", label: "Kiro CLI 2.32.0" },
    )
    assert.deepStrictEqual(
      classifyKiroAccount({ cliVersion: null, kiroHome: "/k", signedIn: true, models: [] }),
      { _tag: "Connected", label: "Kiro CLI" },
    )
    assert.deepStrictEqual(
      classifyKiroAccount({ cliVersion: null, kiroHome: "/k", signedIn: false, models: [] }),
      { _tag: "SignedOut" },
    )
  })

  it("reads the model setting's values and skips entries it cannot read", () => {
    const models = kiroModels([
      {
        id: "model",
        category: "model",
        options: [
          { value: "claude-sonnet", name: "Claude Sonnet", description: "Balanced" },
          { value: 42 },
          { name: "no value" },
          { value: "gpt-x" },
        ],
      },
      { id: "effortLevel", category: "thought_level" },
    ])
    assert.deepStrictEqual(models, [
      { value: "claude-sonnet", displayName: "Claude Sonnet", description: "Balanced" },
      { value: "gpt-x", displayName: "gpt-x", description: "" },
    ])
    assert.deepStrictEqual(kiroModels(undefined), [])
    assert.deepStrictEqual(kiroModels([{ id: "model", category: "model" }]), [])
  })
})

describe("KiroAccountService", () => {
  it.effect("reports the default login with where it lives and what it offers", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
      yield* Effect.gen(function* () {
        const service = yield* KiroAccountService
        const status = yield* service.status({ refresh: false })
        assert.deepStrictEqual(status.connection, { _tag: "Connected", label: "Kiro CLI 2.32.0" })
        assert.strictEqual(status.kiroHome, "/home/me/.kiro")
        assert.strictEqual(status.executable, "kiro-cli")
        assert.deepStrictEqual(status.models, MODELS)
        yield* service.status({ refresh: false })
        assert.strictEqual((yield* Ref.get(probed)).length, 1)
      }).pipe(Effect.provide(layerOver(home, probed)))
    }),
  )

  it.effect("turns a Kiro that cannot start into an Unavailable status, not a failure", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const layer = KiroAccountService.layer.pipe(
        Layer.provide(
          Kiro.layerTest({
            probe: () => Effect.fail(new AcpFailed({ reason: "kiro-cli was not found" })),
          }),
        ),
        Layer.provide(baseLayer(home)),
      )
      yield* Effect.gen(function* () {
        const status = yield* (yield* KiroAccountService).status({ refresh: false })
        assert.deepStrictEqual(status.connection, {
          _tag: "Unavailable",
          reason: "kiro-cli was not found",
        })
        assert.deepStrictEqual(status.models, [])
      }).pipe(Effect.provide(layer))
    }),
  )
})
