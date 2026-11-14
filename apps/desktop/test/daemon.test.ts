import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Duration, Effect, Fiber, Layer, Ref } from "effect"
import { FetchHttpClient } from "effect/http"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type DaemonCommand, restartDelay, supervise } from "../src/daemon.ts"

const Platform = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)

const freePort = Effect.callback<number>((resume) => {
  const server = createServer()
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    const port = typeof address === "object" && address !== null ? address.port : 0
    server.close(() => resume(Effect.succeed(port)))
  })
})

/** A stand-in daemon: answers 401 like `/api/auth` does, and exits when its stdin ends. */
const FAKE_DAEMON = `
import { createServer } from "node:http"
import { appendFileSync } from "node:fs"
appendFileSync(process.env.STARTS, "start\\n")
if (process.env.CRASH === "1") {
  console.error("boom: cannot open database")
  process.exit(1)
}
createServer((_request, response) => {
  response.statusCode = 401
  response.end()
  if (process.env.DIE_AFTER_REQUEST === "1") setTimeout(() => process.exit(1), 50)
}).listen(Number(process.env.PORT), "127.0.0.1")
process.stdin.on("end", () => {
  appendFileSync(process.env.STARTS, "asked to stop\\n")
  process.exit(0)
})
process.stdin.resume()
`

const fakeDaemon = (env: Record<string, string>) =>
  Effect.gen(function* () {
    const dir = mkdtempSync(join(tmpdir(), "humanity-desktop-"))
    const entry = join(dir, "daemon.mjs")
    writeFileSync(entry, FAKE_DAEMON)
    const port = yield* freePort
    const starts = join(dir, "starts.log")
    const command: DaemonCommand = {
      executable: process.execPath,
      entry,
      env: { ...env, PORT: String(port), STARTS: starts },
    }
    return { command, starts, readinessUrl: `http://127.0.0.1:${port}/api/auth` }
  })

const linesOf = (path: string) => readFileSync(path, "utf8").trim().split("\n")

describe("supervise", () => {
  it.live("starts the daemon, reports it ready and asks it to stop", () =>
    Effect.gen(function* () {
      const fake = yield* fakeDaemon({})
      const stop = yield* Deferred.make<void>()
      const ready = yield* Deferred.make<void>()
      const fiber = yield* supervise({
        daemon: fake.command,
        readinessUrl: fake.readinessUrl,
        stop,
        onReady: Deferred.succeed(ready, undefined),
      }).pipe(Effect.forkChild)

      yield* Deferred.await(ready)
      yield* Deferred.succeed(stop, undefined)
      yield* Fiber.join(fiber)

      // It left by itself, on the closed stdin, rather than being killed.
      assert.deepStrictEqual(linesOf(fake.starts), ["start", "asked to stop"])
    }).pipe(Effect.provide(Platform)),
  )

  it.live("restarts a daemon that dies after it was ready", () =>
    Effect.gen(function* () {
      const fake = yield* fakeDaemon({ DIE_AFTER_REQUEST: "1" })
      const stop = yield* Deferred.make<void>()
      const readies = yield* Ref.make(0)
      const second = yield* Deferred.make<void>()
      const fiber = yield* supervise({
        daemon: fake.command,
        readinessUrl: fake.readinessUrl,
        stop,
        restartDelay: () => Duration.millis(10),
        onReady: Ref.updateAndGet(readies, (count) => count + 1).pipe(
          Effect.flatMap((count) =>
            count === 2 ? Deferred.succeed(second, undefined) : Effect.void,
          ),
        ),
      }).pipe(Effect.forkChild)

      yield* Deferred.await(second)
      yield* Deferred.succeed(stop, undefined)
      yield* Fiber.join(fiber)
      assert.isAtLeast(linesOf(fake.starts).filter((line) => line === "start").length, 2)
    }).pipe(Effect.provide(Platform)),
  )

  it.live("gives up on a daemon that never comes up, with what it printed", () =>
    Effect.gen(function* () {
      const fake = yield* fakeDaemon({ CRASH: "1" })
      const stop = yield* Deferred.make<void>()
      const failure = yield* supervise({
        daemon: fake.command,
        readinessUrl: fake.readinessUrl,
        stop,
        maxStartFailures: 3,
        restartDelay: () => Duration.millis(10),
        onReady: Effect.die("a crashing daemon is never ready"),
      }).pipe(Effect.flip)

      assert.strictEqual(failure._tag, "DaemonStartFailed")
      assert.strictEqual(failure.attempts, 3)
      assert.include(failure.output, "boom: cannot open database")
      assert.lengthOf(linesOf(fake.starts), 3)
    }).pipe(Effect.provide(Platform)),
  )

  it.live("without a daemon of its own, waits for the one already running", () =>
    Effect.gen(function* () {
      const fake = yield* fakeDaemon({})
      const stop = yield* Deferred.make<void>()
      const ready = yield* Deferred.make<void>()
      // Someone else's daemon: started outside the supervision under test.
      const other = yield* supervise({
        daemon: fake.command,
        readinessUrl: fake.readinessUrl,
        stop,
        onReady: Effect.void,
      }).pipe(Effect.forkChild)
      const fiber = yield* supervise({
        daemon: undefined,
        readinessUrl: fake.readinessUrl,
        stop,
        onReady: Deferred.succeed(ready, undefined),
      }).pipe(Effect.forkChild)

      yield* Deferred.await(ready)
      yield* Deferred.succeed(stop, undefined)
      yield* Fiber.join(fiber)
      yield* Fiber.join(other)
      assert.deepStrictEqual(linesOf(fake.starts), ["start", "asked to stop"])
    }).pipe(Effect.provide(Platform)),
  )
})

describe("restartDelay", () => {
  it("doubles from half a second and stops at ten", () => {
    assert.deepStrictEqual(
      [0, 1, 2, 3, 10].map((failures) => Duration.toMillis(restartDelay(failures))),
      [500, 1_000, 2_000, 4_000, 10_000],
    )
  })
})
