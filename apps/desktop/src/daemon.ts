import { Data, Deferred, Duration, Effect, Option, Ref, Stream } from "effect"
import { HttpClient } from "effect/http"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

/** The daemon never answered, start after start. `output` is the end of what the last one printed. */
export class DaemonStartFailed extends Data.TaggedError("DaemonStartFailed")<{
  readonly attempts: number
  readonly output: string
}> {}

export interface DaemonCommand {
  readonly executable: string
  readonly entry: string
  readonly env: Readonly<Record<string, string>>
}

export interface SuperviseOptions {
  /** The daemon to start and keep running. `undefined` when one is already running elsewhere. */
  readonly daemon: DaemonCommand | undefined
  /** Answers 200 or 401 once the daemon is serving; the web app's `/api/auth`. */
  readonly readinessUrl: string
  /** Completed to shut down: the daemon is asked to exit, and killed if it does not. */
  readonly stop: Deferred.Deferred<void>
  /** Runs each time the daemon becomes reachable, so also after a restart. */
  readonly onReady: Effect.Effect<void>
  /** Forwarded daemon output, for whoever started the app from a terminal. */
  readonly onOutput?: (chunk: string) => void
  /** Starts in a row that never became reachable before giving up. */
  readonly maxStartFailures?: number
  readonly restartDelay?: (failures: number) => Duration.Duration
  readonly readinessTimeout?: Duration.Input
  /** How long the daemon gets to exit on its own once asked. */
  readonly stopGrace?: Duration.Input
}

const OUTPUT_TAIL = 4_000
const POLL_INTERVAL = "100 millis"

/** 0.5s after a crash, doubling with each start that fails, up to 10s. */
export const restartDelay = (failures: number): Duration.Duration =>
  Duration.millis(Math.min(500 * 2 ** failures, 10_000))

const isUp = (url: string) =>
  HttpClient.get(url).pipe(
    Effect.map((response) => response.status === 200 || response.status === 401),
    Effect.catch(() => Effect.succeed(false)),
  )

const waitUntilUp = (url: string): Effect.Effect<void, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    while (!(yield* isUp(url))) yield* Effect.sleep(POLL_INTERVAL)
  })

/**
 * One life of the daemon: start it, wait until it answers, then until it exits.
 * Its stdin stays open for as long as the app wants it running; closing it is
 * how the daemon is asked to shut down, and how it notices the app died.
 */
const runOnce = (daemon: DaemonCommand, options: SuperviseOptions) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const stopped = Deferred.await(options.stop)

    const handle = yield* spawner.spawn(
      ChildProcess.make(daemon.executable, [daemon.entry], {
        env: daemon.env,
        extendEnv: true,
        stdin: Stream.unwrap(stopped.pipe(Effect.as(Stream.empty))),
        forceKillAfter: "2 seconds",
      }),
    )

    const output = yield* Ref.make("")
    yield* handle.all.pipe(
      Stream.decodeText(),
      Stream.runForEach((chunk) =>
        Effect.sync(() => options.onOutput?.(chunk)).pipe(
          Effect.andThen(Ref.update(output, (text) => (text + chunk).slice(-OUTPUT_TAIL))),
        ),
      ),
      Effect.ignore,
      Effect.forkScoped,
    )

    const exited = handle.exitCode.pipe(Effect.ignore)
    const up = waitUntilUp(options.readinessUrl).pipe(
      Effect.timeoutOption(options.readinessTimeout ?? "60 seconds"),
      Effect.map(Option.isSome),
    )
    const ready = yield* Effect.raceAllFirst([
      up,
      exited.pipe(Effect.as(false)),
      stopped.pipe(Effect.as(false)),
    ])

    if (ready) {
      yield* options.onReady
      yield* Effect.raceFirst(exited, stopped)
    }
    if (yield* Deferred.isDone(options.stop)) {
      yield* exited.pipe(Effect.timeoutOption(options.stopGrace ?? "5 seconds"))
    }
    // Leaving the scope kills whatever is still running.
    return { ready, output: yield* Ref.get(output) }
  }).pipe(Effect.scoped)

/**
 * Keeps the daemon running until `stop` completes: restarts it when it dies,
 * and fails once it has not come up several times in a row. The web app
 * reconnects by itself, since a restarted daemon is back on the same port.
 */
export const supervise = (
  options: SuperviseOptions,
): Effect.Effect<
  void,
  DaemonStartFailed,
  ChildProcessSpawner.ChildProcessSpawner | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const stopped = Deferred.await(options.stop)
    const daemon = options.daemon

    if (daemon === undefined) {
      const up = yield* Effect.raceFirst(
        waitUntilUp(options.readinessUrl).pipe(Effect.as(true)),
        stopped.pipe(Effect.as(false)),
      )
      if (up) yield* options.onReady
      return yield* stopped
    }

    const maxFailures = options.maxStartFailures ?? 4
    const delay = options.restartDelay ?? restartDelay
    let failures = 0
    while (!(yield* Deferred.isDone(options.stop))) {
      const run = yield* runOnce(daemon, options).pipe(
        Effect.catch((error) => Effect.succeed({ ready: false, output: String(error) })),
      )
      if (yield* Deferred.isDone(options.stop)) return
      failures = run.ready ? 0 : failures + 1
      if (failures >= maxFailures) {
        return yield* new DaemonStartFailed({ attempts: failures, output: run.output })
      }
      yield* Effect.raceFirst(Effect.sleep(delay(failures)), stopped)
    }
  })
