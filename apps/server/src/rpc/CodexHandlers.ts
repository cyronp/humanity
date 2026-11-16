import { CodexRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { CodexAccountService } from "../services/CodexAccountService.ts"

export const CodexHandlers = CodexRpcs.toLayer(
  Effect.gen(function* () {
    const account = yield* CodexAccountService
    return CodexRpcs.of({
      "Codex.status": ({ refresh }) => account.status({ refresh }),
    })
  }),
)
