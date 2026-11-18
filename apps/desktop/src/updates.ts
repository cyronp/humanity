import {
  type DesktopUpdateCommand,
  type UpdatePreferences,
  type UpdateState,
  type UpdateTrack,
} from "@humanity/contracts"
import { Data, DateTime, Effect, Predicate, Ref, Semaphore, Stream } from "effect"

export class UpdaterError extends Data.TaggedError("UpdaterError")<{ readonly message: string }> {}

export interface Updater {
  readonly check: (track: UpdateTrack) => Effect.Effect<string | null, UpdaterError>
  readonly download: Stream.Stream<number, UpdaterError>
  readonly install: Effect.Effect<void>
}

export const RELEASES_URL = "https://github.com/cyronp/humanity/releases"

export const feedUrl = (track: UpdateTrack): string =>
  track === "nightly" ? `${RELEASES_URL}/download/nightly` : `${RELEASES_URL}/latest/download`

const errorMessage = (error: UpdaterError): string => error.message

const MAX_MESSAGE = 200

export const describeUpdaterError = (error: unknown): string => {
  const code = Predicate.hasProperty(error, "code") ? error.code : undefined
  if (code === "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") {
    return "No release on this track can be updated to yet."
  }
  const raw = error instanceof Error ? error.message : String(error)
  const firstLine = (raw.split("\n")[0] ?? "").replace(/^(Error: )+/, "").trim()
  if (firstLine === "") return "The update failed without saying why."
  return firstLine.length > MAX_MESSAGE ? `${firstLine.slice(0, MAX_MESSAGE)}…` : firstLine
}

export const serveUpdates = <E, R>(options: {
  readonly updater: Updater | undefined
  readonly unsupported: string
  readonly commands: Stream.Stream<DesktopUpdateCommand, E, R>
  readonly report: (state: UpdateState) => Effect.Effect<void>
  readonly firstOpen: Effect.Effect<boolean>
}): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    const { updater, report } = options
    if (updater === undefined) {
      const unsupported: UpdateState = { _tag: "Unsupported", reason: options.unsupported }
      yield* report(unsupported)
      return yield* options.commands.pipe(
        Stream.runForEach((command) =>
          command._tag === "Configure" ? Effect.void : report(unsupported),
        ),
      )
    }

    const preferences = yield* Ref.make<UpdatePreferences | undefined>(undefined)
    const lock = yield* Semaphore.make(1)
    const checkedAt = DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const track = Ref.get(preferences).pipe(Effect.map((current) => current?.track ?? "stable"))

    const findVersion = Effect.gen(function* () {
      yield* report({ _tag: "Checking" })
      const version = yield* updater.check(yield* track)
      if (version === null) yield* report({ _tag: "UpToDate", checkedAt: yield* checkedAt })
      return version
    })

    const check = Effect.gen(function* () {
      const version = yield* findVersion
      if (version !== null) {
        yield* report({ _tag: "Available", version, checkedAt: yield* checkedAt })
      }
    }).pipe(
      Effect.catch((error) => report({ _tag: "Failed", message: errorMessage(error) })),
      Semaphore.withPermits(lock, 1),
    )

    const install = Effect.gen(function* () {
      const version = yield* findVersion
      if (version === null) return
      yield* report({ _tag: "Downloading", version, percent: 0 })
      yield* updater.download.pipe(
        Stream.map(Math.floor),
        Stream.changes,
        Stream.runForEach((percent) => report({ _tag: "Downloading", version, percent })),
      )
      yield* report({ _tag: "Installing", version })
      yield* Effect.uninterruptible(updater.install)
    }).pipe(
      Effect.catch((error) => report({ _tag: "Failed", message: errorMessage(error) })),
      Semaphore.withPermits(lock, 1),
    )

    const configure = (next: UpdatePreferences) =>
      Effect.gen(function* () {
        const previous = yield* Ref.getAndSet(preferences, next)
        if (previous === undefined) {
          if ((yield* options.firstOpen) && next.autoCheck) yield* Effect.forkScoped(check)
        } else if (previous.track !== next.track) {
          yield* report({ _tag: "Idle" })
        }
      })

    yield* report({ _tag: "Idle" })
    yield* options.commands.pipe(
      Stream.runForEach((command) => {
        switch (command._tag) {
          case "Configure":
            return configure(command.preferences)
          case "Check":
            return Effect.asVoid(Effect.forkScoped(check))
          case "Install":
            return Effect.asVoid(Effect.forkScoped(install))
        }
      }),
    )
  }).pipe(Effect.scoped)
