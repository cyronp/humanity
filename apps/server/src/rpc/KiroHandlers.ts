import { KiroRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { KiroAccountService } from "../services/KiroAccountService.ts"

export const KiroHandlers = KiroRpcs.toLayer(
  Effect.gen(function* () {
    const account = yield* KiroAccountService
    return KiroRpcs.of({
      "Kiro.status": ({ refresh }) => account.status({ refresh }),
      "Kiro.accounts": ({ refresh }) => account.accounts({ refresh }),
      "Kiro.addAccount": ({ name, configDir }) => account.add(name, configDir),
      "Kiro.removeAccount": ({ accountId }) => account.remove(accountId),
      "Kiro.setActiveAccount": ({ accountId }) => account.setActive(accountId),
    })
  }),
)
