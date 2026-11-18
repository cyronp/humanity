import type { FileEntry } from "@humanity/contracts"
import { Clock, Context, Deferred, Effect, Layer } from "effect"
import { type FileIndex, FILE_SEARCH_LIMIT, indexFiles, searchIndex } from "./fileSearch.ts"
import { type GitError, GitService } from "./GitService.ts"

const INDEX_LIFETIME_MS = 5_000
const INDEX_CAPACITY = 32

interface Slot {
  readonly index: FileIndex
  readonly loadedAt: number
}

export class FileSearchService extends Context.Service<
  FileSearchService,
  {
    readonly search: (
      cwd: string,
      query: string,
      recent?: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<FileEntry>, GitError>
  }
>()("humanity/FileSearchService") {
  static readonly layer = Layer.effect(
    FileSearchService,
    Effect.gen(function* () {
      const git = yield* GitService
      const scope = yield* Effect.scope
      const slots = new Map<string, Slot>()
      const loading = new Map<string, Deferred.Deferred<FileIndex, GitError>>()

      const keep = (cwd: string, slot: Slot) => {
        slots.delete(cwd)
        slots.set(cwd, slot)
        for (const oldest of slots.keys()) {
          if (slots.size <= INDEX_CAPACITY) break
          slots.delete(oldest)
        }
      }

      const load = (cwd: string) =>
        Effect.gen(function* () {
          const running = loading.get(cwd)
          if (running !== undefined) return running
          const done = Deferred.makeUnsafe<FileIndex, GitError>()
          loading.set(cwd, done)
          yield* git.listFiles(cwd).pipe(
            Effect.map(indexFiles),
            Effect.tap((index) =>
              Effect.map(Clock.currentTimeMillis, (loadedAt) => keep(cwd, { index, loadedAt })),
            ),
            Effect.exit,
            Effect.flatMap((exit) => Deferred.done(done, exit)),
            Effect.ensuring(Effect.sync(() => loading.delete(cwd))),
            Effect.forkIn(scope),
          )
          return done
        })

      const indexFor = (cwd: string) =>
        Effect.gen(function* () {
          const slot = slots.get(cwd)
          if (slot === undefined) return yield* Deferred.await(yield* load(cwd))
          keep(cwd, slot)
          const now = yield* Clock.currentTimeMillis
          if (now - slot.loadedAt >= INDEX_LIFETIME_MS) yield* load(cwd)
          return slot.index
        })

      const search = (cwd: string, query: string, recent: ReadonlyArray<string> = []) =>
        Effect.map(indexFor(cwd), (index) => searchIndex(index, query, FILE_SEARCH_LIMIT, recent))

      return { search }
    }),
  )
}
