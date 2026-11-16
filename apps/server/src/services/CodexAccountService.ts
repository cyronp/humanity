import type { CodexConnection, CodexStatus } from "@humanity/contracts"
import { Context, DateTime, Effect, Layer, Result } from "effect"
import { Codex, type CodexProbe } from "../codex/Codex.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type AccountRegistry, makeAccountRegistry } from "./accountRegistry.ts"

/** `plus` → `ChatGPT Plus` */
const planLabel = (plan: string | null | undefined): string => {
  if (typeof plan !== "string" || plan === "" || plan === "unknown") return "ChatGPT"
  return `ChatGPT ${plan.charAt(0).toUpperCase()}${plan.slice(1).replace(/_/g, " ")}`
}

export const classifyCodexAccount = (account: CodexProbe["account"]): CodexConnection => {
  if (account === null) return { _tag: "SignedOut" }
  switch (account.type) {
    case "chatgpt":
      return {
        _tag: "Connected",
        method: "chatgpt",
        label: planLabel(account.planType),
        email: account.email ?? null,
      }
    case "apiKey":
      return { _tag: "Connected", method: "apiKey", label: "OpenAI API key", email: null }
    case "amazonBedrock":
      return { _tag: "Connected", method: "cloudProvider", label: "Amazon Bedrock", email: null }
    case "gcp":
      return { _tag: "Connected", method: "cloudProvider", label: "Google Cloud", email: null }
    default:
      return { _tag: "Connected", method: "cloudProvider", label: account.type, email: null }
  }
}

/**
 * The Codex accounts: the default Codex login and every Codex folder
 * (`CODEX_HOME`) added next to it. Humanity holds no credential of its own.
 */
export class CodexAccountService extends Context.Service<
  CodexAccountService,
  AccountRegistry<CodexStatus>
>()("humanity/CodexAccountService") {
  static readonly layer = Layer.effect(
    CodexAccountService,
    Effect.gen(function* () {
      const codex = yield* Codex
      const config = yield* ServerConfig

      const check = (codexHome: string | undefined) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(codex.probe(codexHome))
          const checkedAt = DateTime.formatIso(yield* DateTime.now)
          const base = { executable: codex.executable, checkedAt }
          if (Result.isFailure(result)) {
            yield* Effect.logWarning("Codex check failed", result.failure.reason)
            return {
              ...base,
              connection: { _tag: "Unavailable", reason: result.failure.reason },
              models: [],
              cliVersion: null,
              codexHome: codexHome ?? codex.home,
            } satisfies CodexStatus
          }
          return {
            ...base,
            connection: classifyCodexAccount(result.success.account),
            models: result.success.models,
            cliVersion: result.success.cliVersion ?? null,
            codexHome: codexHome ?? result.success.codexHome ?? codex.home,
          } satisfies CodexStatus
        }).pipe(Effect.withSpan("CodexAccountService.check"))

      return yield* makeAccountRegistry<CodexStatus>({
        provider: "codex",
        table: "codex_accounts",
        activeKey: "active_codex_account",
        accountsDir: config.codexAccountsDir,
        defaultDir: codex.home,
        product: "Codex",
        folderExample: ".codex-work",
        check,
      })
    }),
  )
}
