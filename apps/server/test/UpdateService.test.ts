import { assert, describe, it } from "@effect/vitest"
import {
  DEFAULT_UPDATE_PREFERENCES,
  type DesktopUpdateCommand,
  type UpdateStatus,
} from "@humanity/contracts"
import { Effect, Fiber, Layer, Queue, Stream } from "effect"
import { PreferencesService } from "../src/services/PreferencesService.ts"
import { UpdateService } from "../src/services/UpdateService.ts"
import { baseLayer, tempDir } from "./helpers.ts"

const services = (home: string) =>
  UpdateService.layer.pipe(
    Layer.provideMerge(PreferencesService.layer),
    Layer.provideMerge(baseLayer(home)),
  )

const currentStatus = UpdateService.use((updates) =>
  updates.watch.pipe(Stream.take(1), Stream.runHead),
).pipe(Effect.map((head) => (head._tag === "Some" ? head.value : undefined)))

const attach = (version: string) =>
  Effect.gen(function* () {
    const updates = yield* UpdateService
    const received = yield* Queue.unbounded<DesktopUpdateCommand>()
    const fiber = yield* updates.attachDesktop(version).pipe(
      Stream.runForEach((command) => Queue.offer(received, command)),
      Effect.forkScoped,
    )
    const first = yield* Queue.take(received)
    return { fiber, received, first }
  })

describe("UpdateService", () => {
  it.live("says updates need the desktop app while none is connected", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const status = yield* currentStatus
        assert.strictEqual(status?.currentVersion, null)
        assert.strictEqual(status?.state._tag, "Unsupported")
        assert.deepStrictEqual(status?.preferences, DEFAULT_UPDATE_PREFERENCES)

        const updates = yield* UpdateService
        const check = yield* Effect.flip(updates.check)
        assert.strictEqual(check._tag, "UpdatesUnavailable")
        const install = yield* Effect.flip(updates.install)
        assert.strictEqual(install._tag, "UpdatesUnavailable")
      }).pipe(Effect.provide(services(home)))
    }),
  )

  it.live("hands a connected desktop app its preferences, then the human's commands", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const updates = yield* UpdateService
        const { received, first } = yield* attach("0.2.0")
        assert.deepStrictEqual(first, {
          _tag: "Configure",
          preferences: DEFAULT_UPDATE_PREFERENCES,
        })

        const status = yield* currentStatus
        assert.strictEqual(status?.currentVersion, "0.2.0")
        assert.strictEqual(status?.state._tag, "Idle")

        yield* updates.check
        assert.deepStrictEqual(yield* Queue.take(received), { _tag: "Check" })
        yield* updates.setPreferences({ autoCheck: false, track: "nightly" })
        assert.deepStrictEqual(yield* Queue.take(received), {
          _tag: "Configure",
          preferences: { autoCheck: false, track: "nightly" },
        })
        yield* updates.install
        assert.deepStrictEqual(yield* Queue.take(received), { _tag: "Install" })
      }).pipe(Effect.scoped, Effect.provide(services(home)))
    }),
  )

  it.live("shows what the desktop app reports, until it disconnects", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* Effect.gen(function* () {
        const updates = yield* UpdateService
        const { fiber } = yield* attach("0.2.0")
        yield* updates.report({ _tag: "Available", version: "0.3.0", checkedAt: "2026-11-14" })
        const reported: UpdateStatus | undefined = yield* currentStatus
        assert.deepStrictEqual(reported?.state, {
          _tag: "Available",
          version: "0.3.0",
          checkedAt: "2026-11-14",
        })

        yield* Fiber.interrupt(fiber)
        const left = yield* currentStatus
        assert.strictEqual(left?.currentVersion, null)
        assert.strictEqual(left?.state._tag, "Unsupported")
        assert.strictEqual((yield* Effect.flip(updates.check))._tag, "UpdatesUnavailable")
      }).pipe(Effect.scoped, Effect.provide(services(home)))
    }),
  )

  it.live("keeps the preferences across daemon restarts", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      yield* UpdateService.use((updates) =>
        updates.setPreferences({ autoCheck: false, track: "nightly" }),
      ).pipe(Effect.provide(services(home)))
      const status = yield* currentStatus.pipe(Effect.provide(services(home)))
      assert.deepStrictEqual(status?.preferences, { autoCheck: false, track: "nightly" })
    }),
  )
})
