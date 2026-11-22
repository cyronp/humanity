import type { CheckpointChange } from "@humanity/contracts"
import { Context, Data, Effect, FileSystem, Layer } from "effect"
import { join, resolve } from "node:path"
import { isInsideDir } from "../paths.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { GitService } from "../services/GitService.ts"

export class CheckpointFailed extends Data.TaggedError("CheckpointFailed")<{
  readonly reason: string
}> {}

const PATHS_PER_CALL = 200

const SHADOW_CONFIG = [
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.safecrlf=false",
  "-c",
  "core.quotepath=false",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.longpaths=true",
  "-c",
  "core.hooksPath=",
  "-c",
  "commit.gpgSign=false",
  "-c",
  "user.name=Humanity",
  "-c",
  "user.email=checkpoints@humanity.invalid",
  "-c",
  "color.ui=never",
]

const SHADOW_ATTRIBUTES = "* -text -filter -ident -working-tree-encoding\n"

const chunks = <A>(items: ReadonlyArray<A>, size: number): Array<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

export const parseNameStatus = (output: string): ReadonlyArray<CheckpointChange> => {
  const fields = output.split("\0")
  const changes: Array<CheckpointChange> = []
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const status = fields[index]
    const path = fields[index + 1]
    if (status === undefined || path === undefined || path === "") continue
    const since =
      status === "A" ? "added" : status === "D" ? "deleted" : status === "" ? undefined : "modified"
    if (since !== undefined) changes.push({ path, since })
  }
  return changes
}

const isGitPath = (path: string) =>
  path.split(/[\\/]/).some((segment) => segment.toLowerCase() === ".git")

export class CheckpointStore extends Context.Service<
  CheckpointStore,
  {
    readonly snapshot: (
      sessionId: string,
      folder: string,
      parent: string | undefined,
    ) => Effect.Effect<string, CheckpointFailed>
    readonly changesSince: (
      sessionId: string,
      folder: string,
      checkpoint: string,
    ) => Effect.Effect<
      { readonly current: string; readonly changes: ReadonlyArray<CheckpointChange> },
      CheckpointFailed
    >
    readonly restore: (
      sessionId: string,
      folder: string,
      checkpoint: string,
      current: string,
    ) => Effect.Effect<ReadonlyArray<CheckpointChange>, CheckpointFailed>
    readonly remove: (sessionId: string) => Effect.Effect<void>
  }
>()("humanity/CheckpointStore") {
  static readonly layer = Layer.effect(
    CheckpointStore,
    Effect.gen(function* () {
      const git = yield* GitService
      const fs = yield* FileSystem.FileSystem
      const config = yield* ServerConfig

      const shadowDir = (sessionId: string) => join(config.checkpointsDir, sessionId)

      const run = (sessionId: string, folder: string, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const result = yield* git
            .execResult(folder, [
              `--git-dir=${shadowDir(sessionId)}`,
              `--work-tree=${folder}`,
              ...SHADOW_CONFIG,
              ...args,
            ])
            .pipe(Effect.mapError((error) => new CheckpointFailed({ reason: error.message })))
          if (result.exitCode !== 0) {
            return yield* new CheckpointFailed({
              reason: result.stderr.trim() || `git ${args[0] ?? ""} failed`,
            })
          }
          return result.stdout
        })

      const projectExcludes = (folder: string) =>
        Effect.gen(function* () {
          const result = yield* git.execResult(folder, ["rev-parse", "--git-path", "info/exclude"])
          if (result.exitCode !== 0) return ""
          const path = resolve(folder, result.stdout.trim())
          return yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ""))
        }).pipe(Effect.orElseSucceed(() => ""))

      const ensureShadow = (sessionId: string, folder: string) =>
        Effect.gen(function* () {
          const dir = shadowDir(sessionId)
          const fail = (error: { readonly message: string }) =>
            new CheckpointFailed({ reason: error.message })
          if (!(yield* fs.exists(join(dir, "HEAD")).pipe(Effect.orElseSucceed(() => false)))) {
            yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(fail))
            const init = yield* git
              .execResult(config.checkpointsDir, ["init", "--quiet", "--bare", dir])
              .pipe(Effect.mapError(fail))
            if (init.exitCode !== 0) {
              return yield* new CheckpointFailed({
                reason: init.stderr.trim() || "git init failed",
              })
            }
          }
          yield* fs
            .makeDirectory(join(dir, "info"), { recursive: true })
            .pipe(Effect.mapError(fail))
          yield* fs
            .writeFileString(join(dir, "info", "attributes"), SHADOW_ATTRIBUTES)
            .pipe(Effect.mapError(fail))
          yield* fs
            .writeFileString(join(dir, "info", "exclude"), yield* projectExcludes(folder))
            .pipe(Effect.mapError(fail))
        })

      const writeTree = (sessionId: string, folder: string) =>
        Effect.gen(function* () {
          yield* ensureShadow(sessionId, folder)
          yield* run(sessionId, folder, ["add", "--all", "--ignore-errors", "--", "."]).pipe(
            Effect.catch((error) =>
              Effect.logWarning("some files were left out of a checkpoint", error.reason),
            ),
          )
          return (yield* run(sessionId, folder, ["write-tree"])).trim()
        })

      const commitTree = (
        sessionId: string,
        folder: string,
        tree: string,
        parent: string | undefined,
      ) =>
        Effect.map(
          run(sessionId, folder, [
            "commit-tree",
            tree,
            ...(parent === undefined ? [] : ["-p", parent]),
            "-m",
            "checkpoint",
          ]),
          (out) => out.trim(),
        )

      const snapshot = (sessionId: string, folder: string, parent: string | undefined) =>
        Effect.gen(function* () {
          const tree = yield* writeTree(sessionId, folder)
          if (parent !== undefined) {
            const parentTree = yield* run(sessionId, folder, [
              "rev-parse",
              `${parent}^{tree}`,
            ]).pipe(
              Effect.map((out) => out.trim()),
              Effect.orElseSucceed(() => ""),
            )
            if (parentTree === tree) return parent
          }
          const commit = yield* commitTree(sessionId, folder, tree, parent)
          yield* run(sessionId, folder, ["update-ref", "refs/heads/checkpoints", commit])
          return commit
        })

      const diff = (sessionId: string, folder: string, from: string, to: string) =>
        Effect.map(
          run(sessionId, folder, ["diff", "--name-status", "--no-renames", "-z", from, to]),
          parseNameStatus,
        )

      const latest = (sessionId: string, folder: string) =>
        run(sessionId, folder, ["rev-parse", "--verify", "--quiet", "refs/heads/checkpoints"]).pipe(
          Effect.map((out) => out.trim() || undefined),
          Effect.orElseSucceed(() => undefined),
        )

      const changesSince = (sessionId: string, folder: string, checkpoint: string) =>
        Effect.gen(function* () {
          const current = yield* snapshot(sessionId, folder, yield* latest(sessionId, folder))
          return { current, changes: yield* diff(sessionId, folder, checkpoint, current) }
        })

      const checkoutPaths = (
        sessionId: string,
        folder: string,
        commit: string,
        paths: ReadonlyArray<string>,
      ) =>
        Effect.forEach(
          chunks(paths, PATHS_PER_CALL),
          (chunk) =>
            run(sessionId, folder, [
              "checkout",
              "--no-overlay",
              commit,
              "--",
              ...chunk.map((path) => `:(literal)${path}`),
            ]),
          { discard: true },
        )

      const restore = (sessionId: string, folder: string, checkpoint: string, current: string) =>
        Effect.gen(function* () {
          const changes = yield* diff(sessionId, folder, checkpoint, current)
          const unsafe = changes.find(
            (change) =>
              isGitPath(change.path) || !isInsideDir(folder, resolve(folder, change.path)),
          )
          if (unsafe !== undefined) {
            return yield* new CheckpointFailed({
              reason: `${unsafe.path} is outside the thread's folder.`,
            })
          }
          const paths = changes.map((change) => change.path)
          yield* checkoutPaths(sessionId, folder, checkpoint, paths).pipe(
            Effect.tapError(() =>
              checkoutPaths(sessionId, folder, current, paths).pipe(Effect.ignore),
            ),
          )
          return changes
        })

      const remove = (sessionId: string) =>
        fs.remove(shadowDir(sessionId), { recursive: true, force: true }).pipe(Effect.ignore)

      return CheckpointStore.of({ snapshot, changesSince, restore, remove })
    }),
  )
}
