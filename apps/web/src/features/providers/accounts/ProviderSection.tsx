import type { AgentProvider } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useCallback, useState } from "react"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { usePollWhile } from "@/lib/usePollWhile"
import { AccountRow } from "./AccountRow.tsx"
import { useAccounts } from "./useAccounts.ts"

export function ProviderSection({
  provider,
  options,
}: {
  readonly provider: AgentProvider
  readonly options?: ReactNode
}) {
  const { result, refresh, refreshing, add, remove, setActive } = useAccounts(provider)
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider={provider}
      result={result}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={() => void refresh(true).then(setRefreshError)}
      onAdd={add}
      renderAccount={(account) => (
        <AccountRow
          provider={provider}
          account={account}
          onSetActive={setActive}
          onRemove={remove}
        />
      )}
      options={options}
    />
  )
}
