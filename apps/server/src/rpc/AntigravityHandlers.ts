import { AntigravityRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { AntigravityAccountService } from "../services/AntigravityAccountService.ts"

export const AntigravityHandlers = AntigravityRpcs.toLayer(
  Effect.gen(function* () {
    const account = yield* AntigravityAccountService
    return AntigravityRpcs.of({
      "Antigravity.status": ({ refresh }) => account.status({ refresh }),
      "Antigravity.accounts": ({ refresh }) => account.accounts({ refresh }),
      "Antigravity.addAccount": ({ name, configDir }) => account.add(name, configDir),
      "Antigravity.removeAccount": ({ accountId }) => account.remove(accountId),
      "Antigravity.setActiveAccount": ({ accountId }) => account.setActive(accountId),
    })
  }),
)
