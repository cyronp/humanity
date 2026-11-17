import { Cause, Effect, Queue, Stream } from "effect"
import { NsisUpdater } from "electron-updater"
import { ElectronAppAdapter } from "electron-updater/out/ElectronAppAdapter.js"
import { describeUpdaterError, feedUrl, type Updater, UpdaterError } from "./updates.ts"

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

class ConfinedNsisUpdater extends NsisUpdater {
  constructor(cacheBase: string) {
    super()
    Object.assign(this, { app: new ConfinedAppAdapter(cacheBase) })
  }
}

const updaterError = (error: unknown) => new UpdaterError({ message: describeUpdaterError(error) })

export const makeElectronUpdater = (options: {
  readonly cacheBase: string
  readonly beforeInstall: () => Promise<void>
}): Updater => {
  const updater = new ConfinedNsisUpdater(options.cacheBase)
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
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
      Effect.andThen(Effect.sync(() => updater.quitAndInstall(true, true))),
    ),
  }
}
