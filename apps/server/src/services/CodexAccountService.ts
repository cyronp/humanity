import type { CodexConnection, CodexStatus } from "@humanity/contracts"
import { Context, DateTime, Duration, Effect, Exit, Layer, Result } from "effect"
import { Codex, type CodexProbe } from "../codex/Codex.ts"

/** A working login rarely changes; anything else is re-checked soon, so a fresh login shows up. */
const CONNECTED_TTL = Duration.minutes(5)
const OTHER_TTL = Duration.seconds(10)

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

/** Which login Codex threads run as, and what it offers. Humanity holds no credential of its own. */
export class CodexAccountService extends Context.Service<
  CodexAccountService,
  {
    /** Codex's status. Concurrent callers share one check. */
    readonly status: (options: { readonly refresh: boolean }) => Effect.Effect<CodexStatus>
  }
>()("humanity/CodexAccountService") {
  static readonly layer = Layer.effect(
    CodexAccountService,
    Effect.gen(function* () {
      const codex = yield* Codex

      const check = Effect.gen(function* () {
        const result = yield* Effect.result(codex.probe)
        const checkedAt = DateTime.formatIso(yield* DateTime.now)
        if (Result.isFailure(result)) {
          yield* Effect.logWarning("Codex check failed", result.failure.reason)
          return {
            connection: { _tag: "Unavailable", reason: result.failure.reason },
            models: [],
            cliVersion: null,
            codexHome: null,
            executable: codex.executable,
            checkedAt,
          } satisfies CodexStatus
        }
        return {
          connection: classifyCodexAccount(result.success.account),
          models: result.success.models,
          cliVersion: result.success.cliVersion ?? null,
          codexHome: result.success.codexHome ?? null,
          executable: codex.executable,
          checkedAt,
        } satisfies CodexStatus
      }).pipe(Effect.withSpan("CodexAccountService.check"))

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
