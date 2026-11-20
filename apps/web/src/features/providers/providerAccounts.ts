import { AsyncResult } from "effect/reactivity"
import { accountLine } from "@/features/claude/summary"
import { useClaudeAccounts } from "@/features/claude/useClaudeAccounts"
import { codexLine } from "@/features/codex/summary"
import { useCodexAccounts } from "@/features/codex/useCodexAccounts"
import { antigravityLine } from "@/features/antigravity/summary"
import { useAntigravityAccounts } from "@/features/antigravity/useAntigravityAccounts"
import { kiroLine } from "@/features/kiro/summary"
import { useKiroAccounts } from "@/features/kiro/useKiroAccounts"
import type { ProviderId } from "./ProviderIcon.tsx"

export type AccountState = "connected" | "signedOut" | "unavailable"

export interface ProviderAccount {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly state: AccountState
  readonly detail: string
}

export interface ProviderAccounts {
  readonly result: AsyncResult.AsyncResult<ReadonlyArray<ProviderAccount>, unknown>
  readonly refresh: (force: boolean) => Promise<string | undefined>
  readonly refreshing: boolean
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

const useAntigravity = (): ProviderAccounts => {
  const { result, ...actions } = useAntigravityAccounts()
  return { ...actions, result: AsyncResult.map(result, (all) => toAccounts(all, antigravityLine)) }
}

const ACCOUNT_HOOKS: Record<ProviderId, () => ProviderAccounts> = {
  "claude-code": useClaude,
  codex: useCodex,
  kiro: useKiro,
  antigravity: useAntigravity,
}

export const useProviderAccounts = (provider: ProviderId): ProviderAccounts =>
  ACCOUNT_HOOKS[provider]()
