import type { ClaudeStatus } from "@humanity/contracts"
import { Context, DateTime, Duration, Effect, Exit, Layer, Result } from "effect"
import { classifyAccount } from "../claude/account.ts"
import { ClaudeCode } from "../claude/ClaudeCode.ts"

/** A working login rarely changes; anything else is re-checked soon, so a fresh login shows up. */
const CONNECTED_TTL = Duration.minutes(5)
const OTHER_TTL = Duration.seconds(10)

export class ClaudeAccountService extends Context.Service<
  ClaudeAccountService,
  {
    /** The account agent sessions run as. Concurrent callers share one check. */
    readonly status: (options: { readonly refresh: boolean }) => Effect.Effect<ClaudeStatus>
  }
>()("humanity/ClaudeAccountService") {
  static readonly layer = Layer.effect(
    ClaudeAccountService,
    Effect.gen(function* () {
      const claude = yield* ClaudeCode

      const check = Effect.gen(function* () {
        const result = yield* Effect.result(claude.probe)
        const checkedAt = DateTime.formatIso(yield* DateTime.now)
        const base = {
          configDir: claude.configDir,
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

      const [cached, invalidate] = yield* Effect.cachedInvalidateWithTTL(check, (exit) =>
        Exit.isSuccess(exit) && exit.value.connection._tag === "Connected"
          ? CONNECTED_TTL
          : OTHER_TTL,
      )

      return {
        status: ({ refresh }) => (refresh ? Effect.andThen(invalidate, cached) : cached),
      }
    }),
  )
}
