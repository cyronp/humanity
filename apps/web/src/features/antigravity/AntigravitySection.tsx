import { AsyncResult } from "effect/reactivity"
import { useCallback, useState } from "react"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { usePollWhile } from "@/lib/usePollWhile"
import { AntigravityAccountRow } from "./AntigravityAccountRow.tsx"
import { useAntigravityAccounts } from "./useAntigravityAccounts.ts"

export function AntigravitySection() {
  const { result, refresh, refreshing, add, remove, setActive } = useAntigravityAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider="antigravity"
      result={result}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={() => void refresh(true).then(setRefreshError)}
      onAdd={add}
      renderAccount={(account) => (
        <AntigravityAccountRow account={account} onSetActive={setActive} onRemove={remove} />
      )}
    />
  )
}
