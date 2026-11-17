import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { CodexFailed } from "../src/codex/AppServer.ts"
import { Codex, type CodexProbe } from "../src/codex/Codex.ts"
import { CodexAccountService } from "../src/services/CodexAccountService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

const MODELS = [
  { value: "gpt-test", displayName: "GPT Test", description: "For tests", isDefault: true },
]
const PLUS: CodexProbe["account"] = { type: "chatgpt", email: "dev@example.com", planType: "plus" }

const scripted = (probed: Ref.Ref<ReadonlyArray<string | undefined>>) =>
  Codex.layerTest({
    probe: (codexHome) =>
      Effect.as(
        Ref.update(probed, (homes) => [...homes, codexHome]),
        {
          cliVersion: "0.169.0",
          codexHome: codexHome ?? "/home/me/.codex",
          account: codexHome === undefined ? PLUS : null,
          models: codexHome === undefined ? MODELS : [],
        } satisfies CodexProbe,
      ),
  })

const layerOver = (home: string, probed: Ref.Ref<ReadonlyArray<string | undefined>>) =>
  CodexAccountService.layer.pipe(Layer.provide(scripted(probed)), Layer.provide(baseLayer(home)))

describe("CodexAccountService", () => {
  it.effect("reports the default login with where it lives and what it offers", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
      yield* Effect.gen(function* () {
        const service = yield* CodexAccountService
        const status = yield* service.status({ refresh: false })
        assert.deepStrictEqual(status.connection, {
          _tag: "Connected",
          method: "chatgpt",
          label: "ChatGPT Plus",
          email: "dev@example.com",
        })
        assert.strictEqual(status.codexHome, "/home/me/.codex")
        assert.strictEqual(status.executable, "codex")
        assert.deepStrictEqual(status.models, MODELS)
        yield* service.status({ refresh: false })
        assert.strictEqual((yield* Ref.get(probed)).length, 1)
      }).pipe(Effect.provide(layerOver(home, probed)))
    }),
  )

  it.effect("turns a Codex that cannot start into an Unavailable status, not a failure", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const codex = Codex.layerTest({
        probe: () => Effect.fail(new CodexFailed({ reason: "spawn codex ENOENT" })),
      })
      const status = yield* Effect.gen(function* () {
        return yield* (yield* CodexAccountService).status({ refresh: false })
      }).pipe(
        Effect.provide(
          CodexAccountService.layer.pipe(Layer.provide(codex), Layer.provide(baseLayer(home))),
        ),
      )
      assert.deepStrictEqual(status.connection, {
        _tag: "Unavailable",
        reason: "spawn codex ENOENT",
      })
      assert.strictEqual(status.codexHome, "/home/me/.codex")
    }),
  )

  it.effect("adds an account with a Codex folder of its own and makes it the active one", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
      const layer = layerOver(home, probed)

      const work = yield* Effect.gen(function* () {
        const service = yield* CodexAccountService
        const work = yield* service.add("  Work  ")
        const folder = join(home, "codex-accounts", work.id)
        assert.strictEqual(work.name, "Work")
        assert.isFalse(work.active)
        assert.isFalse(work.linkedFolder)
        assert.strictEqual(work.status.connection._tag, "SignedOut")
        assert.strictEqual(work.status.codexHome, folder)
        assert.isTrue(existsSync(folder))
        assert.deepStrictEqual(yield* Ref.get(probed), [folder])

        assert.isUndefined(yield* service.configDirFor(yield* service.activeId))
        yield* service.setActive(work.id)
        assert.strictEqual((yield* service.status({ refresh: false })).connection._tag, "SignedOut")
        assert.strictEqual(yield* service.configDirFor(work.id), folder)
        return { id: work.id, folder }
      }).pipe(Effect.provide(layer))

      yield* Effect.gen(function* () {
        const service = yield* CodexAccountService
        assert.deepStrictEqual(
          (yield* service.accounts({ refresh: false })).map(({ id, name, isDefault, active }) => ({
            id,
            name,
            isDefault,
            active,
          })),
          [
            { id: "default", name: "Default login", isDefault: true, active: false },
            { id: work.id, name: "Work", isDefault: false, active: true },
          ],
        )

        yield* service.remove(work.id)
        assert.isFalse(existsSync(work.folder))
        assert.strictEqual(yield* service.activeId, "default")
        assert.isUndefined(yield* service.configDirFor(work.id))
      }).pipe(Effect.provide(layer))
    }),
  )

  it.effect("runs an account on an existing folder and leaves the folder when it is removed", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const folder = yield* tempDir()
      writeFileSync(join(folder, "auth.json"), "{}")
      const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
      yield* Effect.gen(function* () {
        const service = yield* CodexAccountService
        const personal = yield* service.add("Personal", folder)
        assert.isTrue(personal.linkedFolder)
        assert.strictEqual(personal.status.codexHome, folder)

        const reasonFor = (configDir: string) =>
          Effect.map(Effect.flip(service.add("Other", configDir)), (error) => error.message)
        assert.include(yield* reasonFor(folder), "“Personal” already")
        assert.include(yield* reasonFor("/home/me/.codex"), "default login")
        assert.include(yield* reasonFor(".codex-work"), "~/.codex-work")
        assert.include(yield* reasonFor(join(home, "codex-accounts")), "Codex folder of your own")

        yield* service.remove(personal.id)
        assert.isTrue(existsSync(join(folder, "auth.json")))
      }).pipe(Effect.provide(layerOver(home, probed)))
    }),
  )

  it.effect("refuses a nameless account and never removes the default login", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const probed = yield* Ref.make<ReadonlyArray<string | undefined>>([])
      yield* Effect.gen(function* () {
        const service = yield* CodexAccountService
        assert.strictEqual((yield* Effect.flip(service.add("   ")))._tag, "AccountNameInvalid")
        assert.strictEqual((yield* Effect.flip(service.remove("default")))._tag, "AccountNotFound")
        assert.strictEqual((yield* Effect.flip(service.setActive("nope")))._tag, "AccountNotFound")
      }).pipe(Effect.provide(layerOver(home, probed)))
    }),
  )
})
