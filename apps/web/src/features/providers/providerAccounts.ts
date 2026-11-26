import type { AgentProvider } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { accountLine } from "./accounts/summary.ts"
import { useAccounts } from "./accounts/useAccounts.ts"
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

export const useProviderAccounts = (provider: AgentProvider): ProviderAccounts => {
  const { result, remove: _remove, ...actions } = useAccounts(provider)
  return {
    ...actions,
    result: AsyncResult.map(result, (accounts) =>
      accounts.map(({ id, name, active, status }) => ({
        id,
        name,
        active,
        state: STATES[status.connection._tag],
        detail: accountLine(provider, status),
      })),
    ),
  }
}
