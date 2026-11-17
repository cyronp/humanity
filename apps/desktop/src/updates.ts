import {
  type DesktopUpdateCommand,
  type UpdatePreferences,
  type UpdateState,
  type UpdateTrack,
} from "@humanity/contracts"
import { Data, DateTime, Effect, Predicate, Ref, Semaphore, Stream } from "effect"

export class UpdaterError extends Data.TaggedError("UpdaterError")<{ readonly message: string }> {}

/** What installs updates: electron-updater in the app, a fake in tests. */
export interface Updater {
  /** The newest version of the track when it is newer than the running one, else `null`. */
  readonly check: (track: UpdateTrack) => Effect.Effect<string | null, UpdaterError>
  /** Downloads the version the last check found, emitting how far along it is in percent. */
  readonly download: Stream.Stream<number, UpdaterError>
  /** Closes the app and runs the installer, which starts the new version. */
  readonly install: Effect.Effect<void>
}

export const RELEASES_URL = "https://github.com/cyronp/humanity/releases"

/**
 * The folder electron-updater reads `latest.yml` from. A stable release is
 * GitHub's latest one, which is never a pre-release; the nightly one is
 * replaced in place every night under the `nightly` tag.
 */
export const feedUrl = (track: UpdateTrack): string =>
  track === "nightly" ? `${RELEASES_URL}/download/nightly` : `${RELEASES_URL}/latest/download`

const errorMessage = (error: UpdaterError): string => error.message

const MAX_MESSAGE = 200

/**
 * A message fit for the settings page. electron-updater's errors carry a
 * `code` and often a whole HTTP response, headers and cookies included: only
 * the first line is kept, and the common case is said in plain words.
 */
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

/**
 * Carries out the daemon's commands until they end: keeps the preferences,
 * looks for updates once when the app opens if `autoCheck` is on, and reports every
 * step. One check or install runs at a time.
 */
export const serveUpdates = <E, R>(options: {
  /** `undefined` where nothing can be installed, with `unsupported` saying why. */
  readonly updater: Updater | undefined
  readonly unsupported: string
  readonly commands: Stream.Stream<DesktopUpdateCommand, E, R>
  readonly report: (state: UpdateState) => Effect.Effect<void>
  /**
   * True only the first time it is asked in the app's life: the check on
   * opening happens once, not again when a restarted daemon is reconnected to.
   */
  readonly firstOpen: Effect.Effect<boolean>
}): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    const { updater, report } = options
    if (updater === undefined) {
      const unsupported: UpdateState = { _tag: "Unsupported", reason: options.unsupported }
      yield* report(unsupported)
      // Stays connected, so the daemon knows the app is here and why it cannot update.
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

    // Checks again first: the track may have changed since, and the download needs a fresh answer.
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
      // Installing stops the daemon first, which ends this connection and with it
      // the scope this runs in: interrupted then, the installer would never start,
      // leaving the app open on a stopped daemon.
      yield* Effect.uninterruptible(updater.install)
    }).pipe(
      Effect.catch((error) => report({ _tag: "Failed", message: errorMessage(error) })),
      Semaphore.withPermits(lock, 1),
    )

    // After the check on opening, only the human asks for another.
    const configure = (next: UpdatePreferences) =>
      Effect.gen(function* () {
        const previous = yield* Ref.getAndSet(preferences, next)
        if (previous === undefined) {
          if ((yield* options.firstOpen) && next.autoCheck) yield* Effect.forkScoped(check)
        } else if (previous.track !== next.track) {
          // What was found was about the other track.
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
