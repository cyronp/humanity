import {
  type AgentProvider,
  planConnection,
  type ProviderConnection,
  type ProviderModel,
  type ProviderStatus,
} from "@humanity/contracts"
import { Context, DateTime, Effect, Layer, Result } from "effect"
import { Antigravity } from "../antigravity/Antigravity.ts"
import { classifyAccount } from "../claude/account.ts"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { Codex, type CodexProbe } from "../codex/Codex.ts"
import { Kiro } from "../kiro/Kiro.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type AccountRegistry, makeAccountRegistry } from "./accountRegistry.ts"

export type ProviderRegistry = AccountRegistry<ProviderStatus>

const codexPlanLabel = (plan: string | null | undefined): string => {
  if (typeof plan !== "string" || plan === "" || plan === "unknown") return "ChatGPT"
  return `ChatGPT ${plan.charAt(0).toUpperCase()}${plan.slice(1).replace(/_/g, " ")}`
}

const connected = (
  method: "plan" | "apiKey" | "cloudProvider",
  label: string,
  email: string | null = null,
): ProviderConnection => ({
  _tag: "Connected",
  method,
  label,
  email,
  organization: null,
  subscriptionShadowed: false,
})

export const classifyCodexAccount = (account: CodexProbe["account"]): ProviderConnection => {
  if (account === null) return { _tag: "SignedOut" }
  switch (account.type) {
    case "chatgpt":
      return connected("plan", codexPlanLabel(account.planType), account.email ?? null)
    case "apiKey":
      return connected("apiKey", "OpenAI API key")
    case "amazonBedrock":
      return connected("cloudProvider", "Amazon Bedrock")
    case "gcp":
      return connected("cloudProvider", "Google Cloud")
    default:
      return connected("cloudProvider", account.type)
  }
}

export const classifyCliAccount = (
  product: string,
  probe: { readonly signedIn: boolean; readonly cliVersion: string | null },
): ProviderConnection =>
  probe.signedIn
    ? planConnection(
        probe.cliVersion === null ? `${product} CLI` : `${product} CLI ${probe.cliVersion}`,
      )
    : { _tag: "SignedOut" }

interface Probed {
  readonly connection: ProviderConnection
  readonly models: ReadonlyArray<ProviderModel>
  readonly cliVersion: string | null
  readonly home: string
}

const checkWith =
  (options: {
    readonly provider: AgentProvider
    readonly product: string
    readonly executable: () => string | null
    readonly home: string
    readonly probe: (dir: string | undefined) => Effect.Effect<Probed, { readonly reason: string }>
  }) =>
  (dir: string | undefined): Effect.Effect<ProviderStatus> =>
    Effect.gen(function* () {
      const result = yield* Effect.result(options.probe(dir))
      const checkedAt = DateTime.formatIso(yield* DateTime.now)
      const executable = options.executable()
      if (Result.isFailure(result)) {
        yield* Effect.logWarning(`${options.product} check failed`, result.failure.reason)
        return {
          connection: { _tag: "Unavailable", reason: result.failure.reason },
          models: [],
          cliVersion: null,
          home: dir ?? options.home,
          executable,
          checkedAt,
        } satisfies ProviderStatus
      }
      return {
        ...result.success,
        models: [...result.success.models],
        executable,
        checkedAt,
      } satisfies ProviderStatus
    }).pipe(
      Effect.withSpan("ProviderAccounts.check", { attributes: { provider: options.provider } }),
    )

export const claudeAccounts = Effect.gen(function* () {
  const claude = yield* ClaudeCode
  const config = yield* ServerConfig
  return yield* makeAccountRegistry({
    provider: "claude-code",
    table: "claude_accounts",
    activeKey: "active_claude_account",
    accountsDir: config.accountsDir,
    defaultDir: claude.configDir,
    product: "Claude Code",
    folderExample: ".claude-personal",
    check: checkWith({
      provider: "claude-code",
      product: "Claude Code",
      executable: () => null,
      home: claude.configDir,
      probe: (configDir) =>
        Effect.map(claude.probe(configDir), (probed) => ({
          connection: classifyAccount(probed.account),
          models: probed.models,
          cliVersion: probed.cliVersion ?? null,
          home: configDir ?? claude.configDir,
        })),
    }),
  })
})

export const codexAccounts = Effect.gen(function* () {
  const codex = yield* Codex
  const config = yield* ServerConfig
  return yield* makeAccountRegistry({
    provider: "codex",
    table: "codex_accounts",
    activeKey: "active_codex_account",
    accountsDir: config.codexAccountsDir,
    defaultDir: codex.home,
    product: "Codex",
    folderExample: ".codex-work",
    check: checkWith({
      provider: "codex",
      product: "Codex",
      executable: codex.executable,
      home: codex.home,
      probe: (codexHome) =>
        Effect.map(codex.probe(codexHome), (probed) => ({
          connection: classifyCodexAccount(probed.account),
          models: probed.models,
          cliVersion: probed.cliVersion ?? null,
          home: codexHome ?? probed.codexHome ?? codex.home,
        })),
    }),
  })
})

export const kiroAccounts = Effect.gen(function* () {
  const kiro = yield* Kiro
  const config = yield* ServerConfig
  return yield* makeAccountRegistry({
    provider: "kiro",
    table: "kiro_accounts",
    activeKey: "active_kiro_account",
    accountsDir: config.kiroAccountsDir,
    defaultDir: kiro.home,
    product: "Kiro",
    folderExample: ".kiro-work",
    check: checkWith({
      provider: "kiro",
      product: "Kiro",
      executable: kiro.executable,
      home: kiro.home,
      probe: (kiroHome) =>
        Effect.map(kiro.probe(kiroHome), (probed) => ({
          connection: classifyCliAccount("Kiro", probed),
          models: probed.models,
          cliVersion: probed.cliVersion,
          home: probed.kiroHome,
        })),
    }),
  })
})

export const antigravityAccounts = Effect.gen(function* () {
  const antigravity = yield* Antigravity
  const config = yield* ServerConfig
  return yield* makeAccountRegistry({
    provider: "antigravity",
    table: "antigravity_accounts",
    activeKey: "active_antigravity_account",
    accountsDir: config.antigravityAccountsDir,
    defaultDir: antigravity.home,
    product: "Antigravity",
    folderExample: ".gemini-work",
    check: checkWith({
      provider: "antigravity",
      product: "Antigravity",
      executable: antigravity.executable,
      home: antigravity.home,
      probe: (geminiHome) =>
        Effect.map(antigravity.probe(geminiHome), (probed) => ({
          connection: classifyCliAccount("Antigravity", probed),
          models: probed.models,
          cliVersion: probed.cliVersion,
          home: probed.geminiHome,
        })),
    }),
  })
})

export class ProviderAccounts extends Context.Service<
  ProviderAccounts,
  Readonly<Record<AgentProvider, ProviderRegistry>>
>()("humanity/ProviderAccounts") {
  static readonly layer = Layer.effect(
    ProviderAccounts,
    Effect.all({
      "claude-code": claudeAccounts,
      codex: codexAccounts,
      kiro: kiroAccounts,
      antigravity: antigravityAccounts,
    }),
  )
}
