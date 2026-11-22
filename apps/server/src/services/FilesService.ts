import { SessionEnded } from "@humanity/contracts"
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

  return { list, read, versions, write }
})

export class FilesService extends Context.Service<FilesService, Effect.Success<typeof make>>()(
  "humanity/FilesService",
) {
  static readonly layer = Layer.effect(FilesService, make)
}
