import { SystemRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { SystemService } from "../services/SystemService.ts"

export const SystemHandlers = SystemRpcs.toLayer(
  Effect.gen(function* () {
    const system = yield* SystemService
    return SystemRpcs.of({
      "System.info": () => system.info,
      "System.openFolder": ({ folder }) => system.openFolder(folder),
      "System.recordings": () => system.recordings,
      "System.clearRecordings": () => system.clearRecordings,
    })
  }),
)
