import {
  type FileSearchOptions,
  FileRefused,
  type NewEntryKind,
  SessionEnded,
} from "@humanity/contracts"
import {
  createEntry,
  deleteEntries,
  fileSearchArgs,
  parseGrep,
  renameEntry,
} from "../files/fileOps.ts"
import { Context, Effect, Layer } from "effect"
import {
  readWorkspaceFile,
  workspaceVersions,
  writeWorkspaceFile,
} from "../files/workspaceFiles.ts"
import { GitService } from "./GitService.ts"
import { SessionService } from "./SessionService.ts"

export interface WriteRequest {
  readonly path: string
  readonly content: string
  readonly bom: boolean
  readonly baseVersion: string | null
  readonly overwrite: boolean
}

const make = Effect.gen(function* () {
  const sessions = yield* SessionService
  const git = yield* GitService

  const folderOf = (sessionId: string) =>
    Effect.map(sessions.get(sessionId), (session) => session.worktreePath)

  const list = (sessionId: string) =>
    Effect.gen(function* () {
      const files = yield* git.listFiles(yield* folderOf(sessionId))
      return { files: [...files].sort() }
    })

  const read = (sessionId: string, path: string) =>
    Effect.flatMap(folderOf(sessionId), (folder) => readWorkspaceFile(folder, path))

  const versions = (sessionId: string, paths: ReadonlyArray<string>) =>
    Effect.flatMap(folderOf(sessionId), (folder) => workspaceVersions(folder, paths))

  const write = (sessionId: string, request: WriteRequest) =>
    Effect.gen(function* () {
      const session = yield* sessions.get(sessionId)
      if (session.status === "ended") return yield* new SessionEnded({ sessionId })
      const saved = yield* writeWorkspaceFile(session.worktreePath, request)
      yield* sessions.noteHumanEdit(sessionId, request.path)
      return saved
    })

  const writable = (sessionId: string) =>
    Effect.gen(function* () {
      const session = yield* sessions.get(sessionId)
      if (session.status === "ended") return yield* new SessionEnded({ sessionId })
      return session.worktreePath
    })

  const create = (sessionId: string, path: string, kind: NewEntryKind) =>
    Effect.gen(function* () {
      yield* createEntry(yield* writable(sessionId), path, kind)
      yield* sessions.noteHumanChange(sessionId, { _tag: "created", path })
    })

  const renameTo = (sessionId: string, from: string, to: string) =>
    Effect.gen(function* () {
      yield* renameEntry(yield* writable(sessionId), from, to)
      yield* sessions.noteHumanChange(sessionId, { _tag: "renamed", from, to })
    })

  const remove = (sessionId: string, paths: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      yield* deleteEntries(yield* writable(sessionId), paths)
      for (const path of paths)
        yield* sessions.noteHumanChange(sessionId, { _tag: "deleted", path })
    })

  const search = (sessionId: string, options: FileSearchOptions) =>
    Effect.gen(function* () {
      if (options.query === "") return { files: [], matches: 0, truncated: false }
      const folder = yield* folderOf(sessionId)
      const result = yield* git.execResult(folder, fileSearchArgs(options))
      if (result.exitCode === 1 && result.stderr.trim() === "") {
        return { files: [], matches: 0, truncated: false }
      }
      if (result.exitCode !== 0) {
        return yield* new FileRefused({
          path: options.query,
          reason: result.stderr.trim().replace(/^fatal: /, "") || "The search could not run.",
        })
      }
      return parseGrep(result.stdout)
    })

  return { list, read, versions, write, create, rename: renameTo, remove, search }
})

export class FilesService extends Context.Service<FilesService, Effect.Success<typeof make>>()(
  "humanity/FilesService",
) {
  static readonly layer = Layer.effect(FilesService, make)
}
