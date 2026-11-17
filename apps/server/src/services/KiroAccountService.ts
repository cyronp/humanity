import type { KiroConnection, KiroStatus } from "@humanity/contracts"
import { Context, DateTime, Effect, Layer, Result } from "effect"
import { Kiro, type KiroProbe } from "../kiro/Kiro.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type AccountRegistry, makeAccountRegistry } from "./accountRegistry.ts"

export const classifyKiroAccount = (probe: KiroProbe): KiroConnection =>
  probe.signedIn
    ? {
        _tag: "Connected",
        label: probe.cliVersion === null ? "Kiro CLI" : `Kiro CLI ${probe.cliVersion}`,
      }
    : { _tag: "SignedOut" }

/**
 * The Kiro accounts (Beta): the default Kiro login and every Kiro folder
 * (`KIRO_HOME`) added next to it. Humanity holds no credential of its own.
 */
export class KiroAccountService extends Context.Service<
  KiroAccountService,
  AccountRegistry<KiroStatus>
>()("humanity/KiroAccountService") {
  static readonly layer = Layer.effect(
    KiroAccountService,
    Effect.gen(function* () {
      const kiro = yield* Kiro
      const config = yield* ServerConfig

      const check = (kiroHome: string | undefined) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(kiro.probe(kiroHome))
          const checkedAt = DateTime.formatIso(yield* DateTime.now)
          const base = { executable: kiro.executable(), checkedAt }
          if (Result.isFailure(result)) {
            yield* Effect.logWarning("Kiro check failed", result.failure.reason)
            return {
              ...base,
              connection: { _tag: "Unavailable", reason: result.failure.reason },
              models: [],
              cliVersion: null,
              kiroHome: kiroHome ?? kiro.home,
            } satisfies KiroStatus
          }
          return {
            ...base,
            connection: classifyKiroAccount(result.success),
            models: [...result.success.models],
            cliVersion: result.success.cliVersion,
            kiroHome: result.success.kiroHome,
          } satisfies KiroStatus
        }).pipe(Effect.withSpan("KiroAccountService.check"))

      return yield* makeAccountRegistry<KiroStatus>({
        provider: "kiro",
        table: "kiro_accounts",
        activeKey: "active_kiro_account",
        accountsDir: config.kiroAccountsDir,
        defaultDir: kiro.home,
        product: "Kiro",
        folderExample: ".kiro-work",
        check,
      })
    }),
  )
}
