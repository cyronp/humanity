import type { AntigravityConnection, AntigravityStatus } from "@humanity/contracts"
import { Context, DateTime, Effect, Layer, Result } from "effect"
import { Antigravity, type AntigravityProbe } from "../antigravity/Antigravity.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type AccountRegistry, makeAccountRegistry } from "./accountRegistry.ts"

export const classifyAntigravityAccount = (probe: AntigravityProbe): AntigravityConnection =>
  probe.signedIn
    ? {
        _tag: "Connected",
        label:
          probe.cliVersion === null ? "Antigravity CLI" : `Antigravity CLI ${probe.cliVersion}`,
      }
    : { _tag: "SignedOut" }

export class AntigravityAccountService extends Context.Service<
  AntigravityAccountService,
  AccountRegistry<AntigravityStatus>
>()("humanity/AntigravityAccountService") {
  static readonly layer = Layer.effect(
    AntigravityAccountService,
    Effect.gen(function* () {
      const antigravity = yield* Antigravity
      const config = yield* ServerConfig

      const check = (geminiHome: string | undefined) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(antigravity.probe(geminiHome))
          const checkedAt = DateTime.formatIso(yield* DateTime.now)
          const base = { executable: antigravity.executable(), checkedAt }
          if (Result.isFailure(result)) {
            yield* Effect.logWarning("Antigravity check failed", result.failure.reason)
            return {
              ...base,
              connection: { _tag: "Unavailable", reason: result.failure.reason },
              models: [],
              cliVersion: null,
              geminiHome: geminiHome ?? antigravity.home,
            } satisfies AntigravityStatus
          }
          return {
            ...base,
            connection: classifyAntigravityAccount(result.success),
            models: [...result.success.models],
            cliVersion: result.success.cliVersion,
            geminiHome: result.success.geminiHome,
          } satisfies AntigravityStatus
        }).pipe(Effect.withSpan("AntigravityAccountService.check"))

      return yield* makeAccountRegistry<AntigravityStatus>({
        provider: "antigravity",
        table: "antigravity_accounts",
        activeKey: "active_antigravity_account",
        accountsDir: config.antigravityAccountsDir,
        defaultDir: antigravity.home,
        product: "Antigravity",
        folderExample: ".gemini-work",
        check,
      })
    }),
  )
}
