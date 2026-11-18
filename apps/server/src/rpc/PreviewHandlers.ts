import { PreviewRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { PreviewFiles } from "../preview/PreviewFiles.ts"
import { PreviewService } from "../preview/PreviewService.ts"

export const PreviewHandlers = PreviewRpcs.toLayer(
  Effect.gen(function* () {
    const preview = yield* PreviewService
    const files = yield* PreviewFiles
    return PreviewRpcs.of({
      "Preview.servers": ({ fast }) => preview.servers(fast),
      "Preview.stopServer": ({ pid, port }) => preview.stopServer(pid, port),
      "Preview.probe": ({ url, embedder }) => preview.probe(url, embedder),
      "Preview.fileUrl": ({ sessionId, path }) => files.urlFor(sessionId, path),
    })
  }),
)
