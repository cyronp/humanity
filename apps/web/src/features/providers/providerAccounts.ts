import { AsyncResult } from "effect/reactivity"
import { accountLine } from "@/features/claude/summary"
import { useClaudeAccounts } from "@/features/claude/useClaudeAccounts"
import { codexLine } from "@/features/codex/summary"
import { useCodexAccounts } from "@/features/codex/useCodexAccounts"
import { kiroLine } from "@/features/kiro/summary"
import { useKiroAccounts } from "@/features/kiro/useKiroAccounts"
import type { ProviderId } from "./ProviderIcon.tsx"

/**
 * The accounts of any provider in one shape, for the places that show every
 * provider alike. A new provider adds its hook to `ACCOUNT_HOOKS`, which the
 * compiler asks for, and shows up in all of them.
 */

/** Signed in, runs but signed out, or its CLI did not start. */
export type AccountState = "connected" | "signedOut" | "unavailable"

export interface ProviderAccount {
  readonly id: string
  readonly name: string
  /** New threads of the provider run as this account. */
  readonly active: boolean
  readonly state: AccountState
  /** One line about its login: the plan and who is signed in, or what is wrong. */
  readonly detail: string
}

export interface ProviderAccounts {
  readonly result: AsyncResult.AsyncResult<ReadonlyArray<ProviderAccount>, unknown>
  /** `force` asks the provider's CLI again; without it the daemon's short cache answers. */
  readonly refresh: (force: boolean) => Promise<string | undefined>
  readonly refreshing: boolean
  /** Resolves to an error message, or `undefined` when the account was added. */
  readonly add: (name: string, configDir?: string) => Promise<string | undefined>
  readonly setActive: (accountId: string) => Promise<string | undefined>
}

const STATES = {
  Connected: "connected",
  SignedOut: "signedOut",
  Unavailable: "unavailable",
} as const satisfies Record<string, AccountState>

interface AccountLike<Status> {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly status: Status
}

const toAccounts = <Status extends { readonly connection: { readonly _tag: keyof typeof STATES } }>(
  accounts: ReadonlyArray<AccountLike<Status>>,
  line: (status: Status) => string,
): ReadonlyArray<ProviderAccount> =>
  accounts.map(({ id, name, active, status }) => ({
    id,
    name,
    active,
    state: STATES[status.connection._tag],
    detail: line(status),
  }))

const useClaude = (): ProviderAccounts => {
  const { result, ...actions } = useClaudeAccounts()
  return { ...actions, result: AsyncResult.map(result, (all) => toAccounts(all, accountLine)) }
}

const useCodex = (): ProviderAccounts => {
  const { result, ...actions } = useCodexAccounts()
  return { ...actions, result: AsyncResult.map(result, (all) => toAccounts(all, codexLine)) }
}

const useKiro = (): ProviderAccounts => {
  const { result, ...actions } = useKiroAccounts()
  return { ...actions, result: AsyncResult.map(result, (all) => toAccounts(all, kiroLine)) }
}

const ACCOUNT_HOOKS: Record<ProviderId, () => ProviderAccounts> = {
  "claude-code": useClaude,
  codex: useCodex,
  kiro: useKiro,
}

/**
 * A provider's accounts. The provider picks the hook, so it must stay the same
 * for the life of the component: render one component per provider, keyed by it.
 */
export const useProviderAccounts = (provider: ProviderId): ProviderAccounts =>
  ACCOUNT_HOOKS[provider]()
