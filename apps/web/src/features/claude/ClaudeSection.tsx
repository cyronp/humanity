import { AsyncResult } from "effect/reactivity"
import { useCallback, useId, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Switch } from "@/components/ui/switch"
import { useHistoryImport } from "@/features/onboarding/historyImport"
import { ProviderAccountList } from "@/features/providers/ProviderAccountList"
import { SettingsRow } from "@/features/settings/SettingsLayout"
import { usePollWhile } from "@/lib/usePollWhile"
import { ClaudeAccountRow } from "./ClaudeAccountRow.tsx"
import { useClaudeAccounts } from "./useClaudeAccounts.ts"

export function ClaudeSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useClaudeAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  return (
    <ProviderAccountList
      provider="claude-code"
      result={result}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={() => void refresh(true).then(setRefreshError)}
      onAdd={add}
      renderAccount={(account) => (
        <ClaudeAccountRow account={account} onSetActive={setActive} onRemove={remove} />
      )}
      options={<HistoryImportSetting />}
    />
  )
}

function HistoryImportSetting() {
  const { enabled, ready, setEnabled, error } = useHistoryImport()
  const labelId = useId()
  return (
    <SettingsRow
      label="Import my Claude Code threads"
      labelId={labelId}
      detail={
        <>
          Lists the conversations you had in Claude Code's own terminal as threads of each project,
          kept up to date. Nothing is written to Claude Code's files.
          {error !== undefined && (
            <span className="mt-2 block">
              <ErrorNote title="The setting was not saved" message={error} />
            </span>
          )}
        </>
      }
    >
      <Switch
        aria-labelledby={labelId}
        checked={enabled}
        disabled={!ready}
        onCheckedChange={(next) => void setEnabled(next)}
      />
    </SettingsRow>
  )
}
