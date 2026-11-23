import { FilesRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { FilesService } from "../services/FilesService.ts"

export const FilesHandlers = FilesRpcs.toLayer(
  Effect.gen(function* () {
    const files = yield* FilesService
    return FilesRpcs.of({
      "Files.list": ({ sessionId }) => files.list(sessionId),
      "Files.read": ({ sessionId, path }) => files.read(sessionId, path),
      "Files.versions": ({ sessionId, paths }) => files.versions(sessionId, paths),
      "Files.write": ({ sessionId, ...request }) => files.write(sessionId, request),
      "Files.search": ({ sessionId, options }) => files.search(sessionId, options),
      "Files.create": ({ sessionId, path, kind }) => files.create(sessionId, path, kind),
      "Files.rename": ({ sessionId, from, to }) => files.rename(sessionId, from, to),
      "Files.delete": ({ sessionId, paths }) => files.remove(sessionId, paths),
    })
  }),
)
