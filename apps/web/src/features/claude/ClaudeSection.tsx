import { AsyncResult } from "effect/reactivity"
import { useCallback, useState } from "react"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { usePollWhile } from "@/lib/usePollWhile"
import { ClaudeAccountRow } from "./ClaudeAccountRow.tsx"
import { useClaudeAccounts } from "./useClaudeAccounts.ts"

/** Claude Code among the providers: its accounts, in one box with its CLI's version. */
export function ClaudeSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useClaudeAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  // Not forced: the daemon re-checks a signed-out account every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider="claude-code"
      result={result}
      version={accounts?.[0]?.status.cliVersion ?? null}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={() => void refresh(true).then(setRefreshError)}
      onAdd={add}
      renderAccount={(account) => (
        <ClaudeAccountRow account={account} onSetActive={setActive} onRemove={remove} />
      )}
    />
  )
}
