import type { FileEntry } from "@humanity/contracts"
import { Cache, Context, Effect, Layer } from "effect"
import { indexFiles, searchIndex } from "./fileSearch.ts"
import { type GitError, GitService } from "./GitService.ts"

const INDEX_LIFETIME = "5 seconds"
const INDEX_CAPACITY = 32

export class FileSearchService extends Context.Service<
  FileSearchService,
  {
    readonly search: (
      cwd: string,
      query: string,
    ) => Effect.Effect<ReadonlyArray<FileEntry>, GitError>
  }
>()("humanity/FileSearchService") {
  static readonly layer = Layer.effect(
    FileSearchService,
    Effect.gen(function* () {
      const git = yield* GitService
      const indexes = yield* Cache.make({
        lookup: (cwd: string) => Effect.map(git.listFiles(cwd), indexFiles),
        capacity: INDEX_CAPACITY,
        timeToLive: INDEX_LIFETIME,
      })
      const search = (cwd: string, query: string) =>
        Effect.map(Cache.get(indexes, cwd), (index) => searchIndex(index, query))
      return { search }
    }),
  )
}
