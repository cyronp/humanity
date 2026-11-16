import { AsyncResult } from "effect/reactivity"
import { useCallback, useState } from "react"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { usePollWhile } from "@/lib/usePollWhile"
import { CodexAccountRow } from "./CodexAccountRow.tsx"
import { useCodexAccounts } from "./useCodexAccounts.ts"

/** Codex among the providers: its accounts, in one box with its CLI's version. */
export function CodexSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useCodexAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  // Not forced: the daemon re-checks a signed-out account every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider="codex"
      result={result}
      version={accounts?.[0]?.status.cliVersion ?? null}
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
