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
    })
  }),
)
