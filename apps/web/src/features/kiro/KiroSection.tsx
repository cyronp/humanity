import { AsyncResult } from "effect/reactivity"
import { useCallback, useState } from "react"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { usePollWhile } from "@/lib/usePollWhile"
import { KiroAccountRow } from "./KiroAccountRow.tsx"
import { useKiroAccounts } from "./useKiroAccounts.ts"

/** Kiro (Beta) among the providers: its accounts, in one box with its CLI's version. */
export function KiroSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useKiroAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  // Not forced: the daemon re-checks a signed-out account every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider="kiro"
      result={result}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={() => void refresh(true).then(setRefreshError)}
      onAdd={add}
      renderAccount={(account) => (
        <KiroAccountRow account={account} onSetActive={setActive} onRemove={remove} />
      )}
    />
  )
}
