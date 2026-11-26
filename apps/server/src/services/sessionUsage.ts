import {
  type ContextUsage,
  type PlanUsage,
  PlanUsageUnavailable,
  PROVIDER_NAMES,
  type Session,
  type SessionUsage,
} from "@humanity/contracts"
import { DateTime, Effect, Option } from "effect"
import { ClaudeCode } from "../claude/ClaudeCode.ts"
import { Codex } from "../codex/Codex.ts"
import { SessionRepo } from "../db/SessionRepo.ts"
import { UsageRepo } from "../db/UsageRepo.ts"
import { makeAccountsUsage, type UsageAccount } from "./accountsUsage.ts"
import { ProviderAccounts, type ProviderRegistry } from "./ProviderAccounts.ts"
import { SessionEvents } from "./SessionEvents.ts"

export const makeSessionUsage = Effect.gen(function* () {
  const repo = yield* SessionRepo
  const usageRepo = yield* UsageRepo
  const events = yield* SessionEvents
  const accounts = yield* ProviderAccounts
  const claude = yield* ClaudeCode
  const codex = yield* Codex

  const store = (
    sessionId: string,
    context: ContextUsage | undefined,
    plan: PlanUsage | undefined,
  ) =>
    Effect.gen(function* () {
      const known = yield* repo.getUsage(sessionId)
      if (context === undefined && plan === undefined) return known
      const usage: SessionUsage = {
        context: context ?? known.context,
        plan: plan ?? known.plan,
      }
      yield* repo.setUsage(sessionId, usage)
      if (plan !== undefined) {
        const session = yield* repo.get(sessionId)
        if (Option.isSome(session)) {
          yield* usageRepo.recordPlan(
            session.value.provider,
            yield* repo.getAccountId(sessionId),
            plan,
            DateTime.formatIso(yield* DateTime.now),
          )
        }
      }
      yield* events.publish(sessionId, { _tag: "UsageUpdated", usage })
      return usage
    })

  const refreshIdle = (session: Session) =>
    Effect.gen(function* () {
      const unavailable = (reason: string) => new PlanUsageUnavailable({ reason })
      if (session.provider === "kiro" || session.provider === "antigravity") {
        return yield* unavailable(
          `${PROVIDER_NAMES[session.provider]} does not report plan limits here.`,
        )
      }
      const dir = yield* Effect.flatMap(repo.getAccountId(session.id), (accountId) =>
        accounts[session.provider].configDirFor(accountId),
      )
      const plan =
        session.provider === "codex"
          ? yield* codex.planUsage(dir).pipe(Effect.mapError((error) => unavailable(error.reason)))
          : yield* claude.planUsage(dir).pipe(Effect.mapError((error) => unavailable(error.reason)))
      if (plan === undefined) {
        return yield* unavailable("this login has no plan limits to report.")
      }
      return yield* store(session.id, undefined, plan)
    })

  const signedIn = (registry: ProviderRegistry): Effect.Effect<ReadonlyArray<UsageAccount>> =>
    Effect.map(registry.accounts({ refresh: false }), (listed) =>
      listed.map((account) => ({
        id: account.id,
        name: account.name,
        connected: account.status.connection._tag === "Connected",
      })),
    )

  const readAccountsUsage = yield* makeAccountsUsage([
    {
      provider: "claude-code",
      accounts: signedIn(accounts["claude-code"]),
      plan: (accountId) =>
        Effect.flatMap(accounts["claude-code"].configDirFor(accountId), (dir) =>
          claude.planUsage(dir),
        ),
    },
    {
      provider: "codex",
      accounts: signedIn(accounts.codex),
      plan: (accountId) =>
        Effect.flatMap(accounts.codex.configDirFor(accountId), (dir) => codex.planUsage(dir)),
    },
    { provider: "kiro", accounts: signedIn(accounts.kiro) },
    { provider: "antigravity", accounts: signedIn(accounts.antigravity) },
  ])

  return { store, refreshIdle, otherAccounts: readAccountsUsage }
})
