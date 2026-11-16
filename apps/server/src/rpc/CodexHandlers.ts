import { CodexRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { CodexAccountService } from "../services/CodexAccountService.ts"

export const CodexHandlers = CodexRpcs.toLayer(
  Effect.gen(function* () {
    const account = yield* CodexAccountService
    return CodexRpcs.of({
      "Codex.status": ({ refresh }) => account.status({ refresh }),
      "Codex.accounts": ({ refresh }) => account.accounts({ refresh }),
      "Codex.addAccount": ({ name, configDir }) => account.add(name, configDir),
      "Codex.removeAccount": ({ accountId }) => account.remove(accountId),
      "Codex.setActiveAccount": ({ accountId }) => account.setActive(accountId),
    })
  }),
)
