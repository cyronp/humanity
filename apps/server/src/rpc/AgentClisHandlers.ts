import { AgentClisRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { AgentCliService } from "../services/AgentCliService.ts"

export const AgentClisHandlers = AgentClisRpcs.toLayer(
  Effect.gen(function* () {
    const clis = yield* AgentCliService
    return AgentClisRpcs.of({
      "AgentClis.status": ({ provider }) => clis.status(provider),
      "AgentClis.update": ({ provider }) => clis.update(provider),
    })
  }),
)
