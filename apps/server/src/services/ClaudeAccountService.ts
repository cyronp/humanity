import type { ClaudeStatus } from "@humanity/contracts"
import { Context, DateTime, Effect, Layer, Result } from "effect"
import { classifyAccount } from "../claude/account.ts"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { ServerConfig } from "../ServerConfig.ts"
import { type AccountRegistry, makeAccountRegistry } from "./accountRegistry.ts"

/**
 * The Claude accounts: the default Claude Code login and every config folder
 * added next to it. Humanity holds no credential of its own.
 */
export class ClaudeAccountService extends Context.Service<
  ClaudeAccountService,
  AccountRegistry<ClaudeStatus>
>()("humanity/ClaudeAccountService") {
  static readonly layer = Layer.effect(
    ClaudeAccountService,
    Effect.gen(function* () {
      const claude = yield* ClaudeCode
      const config = yield* ServerConfig

      const check = (configDir: string | undefined) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(claude.probe(configDir))
          const checkedAt = DateTime.formatIso(yield* DateTime.now)
          const base = {
            configDir: configDir ?? claude.configDir,
            bundledExecutable: claude.bundledExecutable,
            checkedAt,
          }
          if (Result.isFailure(result)) {
            yield* Effect.logWarning("Claude Code check failed", result.failure.reason)
            return {
              ...base,
              connection: { _tag: "Unavailable", reason: result.failure.reason },
              models: [],
              cliVersion: null,
            } satisfies ClaudeStatus
          }
          return {
            ...base,
            connection: classifyAccount(result.success.account),
            models: result.success.models,
            cliVersion: result.success.cliVersion ?? null,
          } satisfies ClaudeStatus
        }).pipe(Effect.withSpan("ClaudeAccountService.check"))

      return yield* makeAccountRegistry<ClaudeStatus>({
        provider: "claude-code",
        table: "claude_accounts",
        activeKey: "active_claude_account",
        accountsDir: config.accountsDir,
        defaultDir: claude.configDir,
        product: "Claude Code",
        folderExample: ".claude-personal",
        check,
      })
    }),
  )
}
