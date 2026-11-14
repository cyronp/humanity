import { assert, describe, it } from "@effect/vitest"
import type {
  DesktopUpdateCommand,
  UpdatePreferences,
  UpdateState,
  UpdateTrack,
} from "@humanity/contracts"
import { Effect, Queue, Ref, Stream } from "effect"
import {
  describeUpdaterError,
  feedUrl,
  serveUpdates,
  type Updater,
  UpdaterError,
} from "../src/updates.ts"
import { rpcSocketUrl } from "../src/updatesClient.ts"

const configure = (preferences: UpdatePreferences): DesktopUpdateCommand => ({
  _tag: "Configure",
  preferences,
})

/**
 * Runs `serveUpdates` in the background against a fake updater. Commands go
 * in through `send`; every report comes out of `next` in order.
 */
const harness = (options: {
  readonly updater?: Updater
  readonly unsupported?: string
  /** False for a connection made after the app had already opened. */
  readonly firstOpen?: boolean
}) =>
  Effect.gen(function* () {
    const opening = yield* Ref.make(options.firstOpen ?? true)
    const commands = yield* Queue.unbounded<DesktopUpdateCommand>()
    const reports = yield* Queue.unbounded<UpdateState>()
    yield* serveUpdates({
      updater: options.updater,
      unsupported: options.unsupported ?? "",
      commands: Stream.fromQueue(commands),
      report: (state) => Queue.offer(reports, state).pipe(Effect.asVoid),
      firstOpen: Ref.getAndSet(opening, false),
    }).pipe(Effect.forkScoped)
    return {
      send: (command: DesktopUpdateCommand) => Queue.offer(commands, command),
      next: Queue.take(reports),
      nextTag: Queue.take(reports).pipe(Effect.map((state) => state._tag)),
    }
  })

/** A fake updater that finds `version` (or nothing), downloads in two steps and records what it was asked. */
const fakeUpdater = (version: string | null, failCheck = false) =>
  Effect.gen(function* () {
    const tracks = yield* Ref.make<ReadonlyArray<UpdateTrack>>([])
    const installed = yield* Ref.make(false)
    const updater: Updater = {
      check: (track) =>
        Ref.update(tracks, (all) => [...all, track]).pipe(
          Effect.andThen(
            failCheck
              ? Effect.fail(new UpdaterError({ message: "GitHub is unreachable" }))
              : Effect.succeed(version),
          ),
        ),
      download: Stream.make(40.6, 100),
      install: Ref.set(installed, true),
    }
    return { updater, tracks, installed }
  })

describe("serveUpdates", () => {
  it.effect("reports why it cannot update, and again whenever asked to", () =>
    Effect.gen(function* () {
      const app = yield* harness({ unsupported: "This is a development build." })
      assert.deepStrictEqual(yield* app.next, {
        _tag: "Unsupported",
        reason: "This is a development build.",
      })
      yield* app.send(configure({ autoCheck: true, track: "stable" }))
      yield* app.send({ _tag: "Check" })
      assert.strictEqual(yield* app.nextTag, "Unsupported")
    }).pipe(Effect.scoped),
  )

  it.effect("checks once when the app opens with automatic checks on", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater("0.3.0")
      const app = yield* harness({ updater: fake.updater })
      assert.strictEqual(yield* app.nextTag, "Idle")
      yield* app.send(configure({ autoCheck: true, track: "nightly" }))
      assert.strictEqual(yield* app.nextTag, "Checking")
      const found = yield* app.next
      assert.strictEqual(found._tag, "Available")
      assert.strictEqual(found._tag === "Available" ? found.version : "", "0.3.0")
      assert.deepStrictEqual(yield* Ref.get(fake.tracks), ["nightly"])
    }).pipe(Effect.scoped),
  )

  it.effect("waits to be asked when automatic checks are off", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater(null)
      const app = yield* harness({ updater: fake.updater })
      assert.strictEqual(yield* app.nextTag, "Idle")
      yield* app.send(configure({ autoCheck: false, track: "stable" }))
      yield* app.send({ _tag: "Check" })
      assert.strictEqual(yield* app.nextTag, "Checking")
      assert.strictEqual(yield* app.nextTag, "UpToDate")
      assert.deepStrictEqual(yield* Ref.get(fake.tracks), ["stable"])
    }).pipe(Effect.scoped),
  )

  it.effect("does not check again when reconnecting to a restarted daemon", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater(null)
      const app = yield* harness({ updater: fake.updater, firstOpen: false })
      assert.strictEqual(yield* app.nextTag, "Idle")
      yield* app.send(configure({ autoCheck: true, track: "stable" }))
      // The next report comes from the human's check, not from one of its own.
      yield* app.send({ _tag: "Check" })
      assert.strictEqual(yield* app.nextTag, "Checking")
      assert.strictEqual(yield* app.nextTag, "UpToDate")
      assert.deepStrictEqual(yield* Ref.get(fake.tracks), ["stable"])
    }).pipe(Effect.scoped),
  )

  it.effect("does not check when automatic checks are turned on later", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater(null)
      const app = yield* harness({ updater: fake.updater })
      assert.strictEqual(yield* app.nextTag, "Idle")
      yield* app.send(configure({ autoCheck: false, track: "stable" }))
      yield* app.send(configure({ autoCheck: true, track: "stable" }))
      yield* app.send({ _tag: "Check" })
      assert.strictEqual(yield* app.nextTag, "Checking")
      assert.strictEqual(yield* app.nextTag, "UpToDate")
      assert.deepStrictEqual(yield* Ref.get(fake.tracks), ["stable"])
    }).pipe(Effect.scoped),
  )

  it.effect("checks again, downloads with progress, then installs", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater("0.3.0")
      const app = yield* harness({ updater: fake.updater })
      yield* app.next
      yield* app.send(configure({ autoCheck: false, track: "stable" }))
      yield* app.send({ _tag: "Install" })
      const steps: Array<UpdateState> = []
      for (let i = 0; i < 5; i++) steps.push(yield* app.next)
      assert.deepStrictEqual(steps, [
        { _tag: "Checking" },
        { _tag: "Downloading", version: "0.3.0", percent: 0 },
        { _tag: "Downloading", version: "0.3.0", percent: 40 },
        { _tag: "Downloading", version: "0.3.0", percent: 100 },
        { _tag: "Installing", version: "0.3.0" },
      ])
      assert.isTrue(yield* Ref.get(fake.installed))
    }).pipe(Effect.scoped),
  )

  it.effect("installs nothing when there is nothing newer", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater(null)
      const app = yield* harness({ updater: fake.updater })
      yield* app.next
      yield* app.send(configure({ autoCheck: false, track: "stable" }))
      yield* app.send({ _tag: "Install" })
      assert.strictEqual(yield* app.nextTag, "Checking")
      assert.strictEqual(yield* app.nextTag, "UpToDate")
      assert.isFalse(yield* Ref.get(fake.installed))
    }).pipe(Effect.scoped),
  )

  it.effect("reports a failed check instead of failing", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater(null, true)
      const app = yield* harness({ updater: fake.updater })
      yield* app.next
      yield* app.send(configure({ autoCheck: false, track: "stable" }))
      yield* app.send({ _tag: "Check" })
      assert.strictEqual(yield* app.nextTag, "Checking")
      assert.deepStrictEqual(yield* app.next, {
        _tag: "Failed",
        message: "GitHub is unreachable",
      })
    }).pipe(Effect.scoped),
  )

  it.effect("forgets what it found when the track changes", () =>
    Effect.gen(function* () {
      const fake = yield* fakeUpdater("0.3.0")
      const app = yield* harness({ updater: fake.updater })
      yield* app.next
      yield* app.send(configure({ autoCheck: false, track: "stable" }))
      yield* app.send(configure({ autoCheck: false, track: "nightly" }))
      assert.strictEqual(yield* app.nextTag, "Idle")
    }).pipe(Effect.scoped),
  )
})

describe("feedUrl", () => {
  it("reads stable releases from GitHub's latest one, and nightlies from their own tag", () => {
    assert.strictEqual(
      feedUrl("stable"),
      "https://github.com/cyronp/humanity/releases/latest/download",
    )
    assert.strictEqual(
      feedUrl("nightly"),
      "https://github.com/cyronp/humanity/releases/download/nightly",
    )
  })
})

describe("rpcSocketUrl", () => {
  it("reaches the daemon's socket with the token in the query", () => {
    assert.strictEqual(
      rpcSocketUrl("http://127.0.0.1:7421", "a b"),
      "ws://127.0.0.1:7421/rpc?token=a+b",
    )
  })
})

describe("describeUpdaterError", () => {
  it("says plainly that a track has nothing to update to yet", () => {
    const error = Object.assign(new Error('Cannot find channel "latest.yml" update info: 404'), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    })
    assert.strictEqual(
      describeUpdaterError(error),
      "No release on this track can be updated to yet.",
    )
  })

  it("keeps only the first line, never the response headers that follow", () => {
    const error = new Error(
      'Error: net::ERR_INTERNET_DISCONNECTED\nHeaders: {"set-cookie": "secret"}',
    )
    assert.strictEqual(describeUpdaterError(error), "net::ERR_INTERNET_DISCONNECTED")
  })

  it("shortens a long first line", () => {
    const message = describeUpdaterError(new Error("x".repeat(500)))
    assert.strictEqual(message.length, 201)
  })
})
