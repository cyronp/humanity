import { ClaudeRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { ClaudeAccountService } from "../services/ClaudeAccountService.ts"

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  Effect.gen(function* () {
    const account = yield* ClaudeAccountService
    return ClaudeRpcs.of({
      "Claude.status": ({ refresh }) => account.status({ refresh }),
      "Claude.accounts": ({ refresh }) => account.accounts({ refresh }),
      "Claude.addAccount": ({ name }) => account.add(name),
      "Claude.removeAccount": ({ accountId }) => account.remove(accountId),
      "Claude.setActiveAccount": ({ accountId }) => account.setActive(accountId),
    })
  }),
)
