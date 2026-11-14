import { Cause, Effect, Queue, Stream } from "effect"
import { NsisUpdater } from "electron-updater"
import { ElectronAppAdapter } from "electron-updater/out/ElectronAppAdapter.js"
import { describeUpdaterError, feedUrl, type Updater, UpdaterError } from "./updates.ts"

/** electron-updater's app, with its download cache moved from the system's cache folder into Humanity's. */
class ConfinedAppAdapter extends ElectronAppAdapter {
  readonly #cacheBase: string

  constructor(cacheBase: string) {
    super()
    this.#cacheBase = cacheBase
  }

  override get baseCachePath(): string {
    return this.#cacheBase
  }
}

/**
 * The NSIS updater, writing only inside `cacheBase`. The adapter is swapped in
 * after construction: passing one to the constructor would leave the updater
 * without its Electron HTTP client. Nothing reads it before the first check.
 */
class ConfinedNsisUpdater extends NsisUpdater {
  constructor(cacheBase: string) {
    super()
    Object.assign(this, { app: new ConfinedAppAdapter(cacheBase) })
  }
}

const updaterError = (error: unknown) => new UpdaterError({ message: describeUpdaterError(error) })

/**
 * Updates of the installed Windows app, from the GitHub releases of the
 * chosen track. Downloads wait in `cacheBase`; `beforeInstall` runs before
 * the installer starts, which then closes the app.
 */
export const makeElectronUpdater = (options: {
  readonly cacheBase: string
  readonly beforeInstall: () => Promise<void>
}): Updater => {
  const updater = new ConfinedNsisUpdater(options.cacheBase)
  // Only the human starts a download or an install, and only from the settings.
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  // A nightly that turns stable is not offered the older stable release.
  updater.allowDowngrade = false

  return {
    check: (track) =>
      Effect.tryPromise({
        try: async () => {
          updater.setFeedURL({ provider: "generic", url: feedUrl(track) })
          const result = await updater.checkForUpdates()
          return result?.isUpdateAvailable === true ? result.updateInfo.version : null
        },
        catch: updaterError,
      }),
    download: Stream.callback<number, UpdaterError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onProgress = (progress: { readonly percent: number }) =>
            Queue.offerUnsafe(queue, progress.percent)
          updater.on("download-progress", onProgress)
          updater.downloadUpdate().then(
            () => Queue.endUnsafe(queue),
            (error: unknown) => Queue.failCauseUnsafe(queue, Cause.fail(updaterError(error))),
          )
          return onProgress
        }),
        (onProgress) => Effect.sync(() => updater.off("download-progress", onProgress)),
      ),
    ),
    install: Effect.promise(options.beforeInstall).pipe(
      // Silent, then started again: the human already chose to update.
      Effect.andThen(Effect.sync(() => updater.quitAndInstall(true, true))),
    ),
  }
}
