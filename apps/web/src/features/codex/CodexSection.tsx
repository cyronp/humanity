import { AsyncResult } from "effect/reactivity"
import { useCallback, useState } from "react"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { usePollWhile } from "@/lib/usePollWhile"
import { CodexAccountRow } from "./CodexAccountRow.tsx"
import { useCodexAccounts } from "./useCodexAccounts.ts"

export function CodexSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useCodexAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider="codex"
      result={result}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={() => void refresh(true).then(setRefreshError)}
      onAdd={add}
      renderAccount={(account) => (
        <CodexAccountRow account={account} onSetActive={setActive} onRemove={remove} />
      )}
    />
  )
}
