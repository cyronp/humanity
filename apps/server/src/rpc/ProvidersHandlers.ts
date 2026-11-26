import { ProvidersRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { ProviderAccounts } from "../services/ProviderAccounts.ts"

export const ProvidersHandlers = ProvidersRpcs.toLayer(
  Effect.gen(function* () {
    const accounts = yield* ProviderAccounts
    return ProvidersRpcs.of({
      "Providers.status": ({ provider, refresh }) => accounts[provider].status({ refresh }),
      "Providers.accounts": ({ provider, refresh }) => accounts[provider].accounts({ refresh }),
      "Providers.addAccount": ({ provider, name, configDir }) =>
        accounts[provider].add(name, configDir),
      "Providers.removeAccount": ({ provider, accountId }) => accounts[provider].remove(accountId),
      "Providers.setActiveAccount": ({ provider, accountId }) =>
        accounts[provider].setActive(accountId),
    })
  }),
)
