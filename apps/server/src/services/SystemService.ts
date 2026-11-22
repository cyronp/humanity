import {
  FolderOpenFailed,
  type RecordingsUsage,
  type SystemFolder,
  type SystemInfo,
} from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { arch, platform, release } from "node:os"
import { join } from "node:path"
import { ServerConfig } from "../ServerConfig.ts"

const OPEN_TIMEOUT = "10 seconds"

export const folderOpener = (
  os: NodeJS.Platform,
  path: string,
): { readonly command: string; readonly args: ReadonlyArray<string> } =>
  os === "win32"
    ? { command: "explorer.exe", args: [path] }
    : os === "darwin"
      ? { command: "open", args: [path] }
      : { command: "xdg-open", args: [path] }

const NO_RECORDINGS: RecordingsUsage = { files: 0, bytes: 0 }

export class SystemService extends Context.Service<
  SystemService,
  {
    readonly info: Effect.Effect<SystemInfo>
    readonly openFolder: (folder: SystemFolder) => Effect.Effect<void, FolderOpenFailed>
    readonly recordings: Effect.Effect<RecordingsUsage>
    readonly clearRecordings: Effect.Effect<RecordingsUsage>
  }
>()("humanity/SystemService") {
  static readonly layer = Layer.effect(
    SystemService,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const fs = yield* FileSystem.FileSystem
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const recordingsDir = join(config.home, "recordings")

      const info = Effect.sync((): SystemInfo => ({
        dataDir: config.home,
        recordingsDir,
        port: config.port,
        platform: platform(),
        arch: arch(),
        osRelease: release(),
        nodeVersion: process.versions.node,
        electronVersion: process.versions["electron"] ?? null,
      }))

      const folderPath = (folder: SystemFolder) => (folder === "data" ? config.home : recordingsDir)

      const openFolder = (folder: SystemFolder) =>
        Effect.gen(function* () {
          const path = folderPath(folder)
          yield* fs.makeDirectory(path, { recursive: true })
          const opener = folderOpener(process.platform, path)
          const handle = yield* spawner.spawn(
            ChildProcess.make(opener.command, [...opener.args], {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            }),
          )
          yield* handle.exitCode.pipe(Effect.timeout(OPEN_TIMEOUT), Effect.ignore)
        }).pipe(
          Effect.scoped,
          Effect.mapError(
            (error) => new FolderOpenFailed({ path: folderPath(folder), reason: error.message }),
          ),
        )

      const walk = (folder: string): Effect.Effect<RecordingsUsage> =>
        Effect.gen(function* () {
          if (!(yield* fs.exists(folder))) return NO_RECORDINGS
          let files = 0
          let bytes = 0
          for (const name of yield* fs.readDirectory(folder)) {
            const path = join(folder, name)
            const stat = yield* fs.stat(path)
            if (stat.type === "Directory") {
              const inner = yield* walk(path)
              files += inner.files
              bytes += inner.bytes
            } else if (stat.type === "File") {
              files += 1
              bytes += Number(stat.size)
            }
          }
          return { files, bytes }
        }).pipe(Effect.orElseSucceed(() => NO_RECORDINGS))

      const recordings = walk(recordingsDir)

      const clearRecordings = Effect.gen(function* () {
        yield* fs.remove(recordingsDir, { recursive: true }).pipe(Effect.ignore)
        return yield* recordings
      })

      return SystemService.of({ info, openFolder, recordings, clearRecordings })
    }),
  )
}
