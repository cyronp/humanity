import { AsyncResult } from "effect/reactivity"
import { useCallback, useId } from "react"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { accountLine, isReady } from "@/features/claude/summary"
import { useClaudeAccounts } from "@/features/claude/useClaudeAccounts"
import { AddAccount } from "@/features/providers/AddAccount"
import { PROVIDERS } from "@/features/providers/ProviderIcon"
import { openSettings } from "@/features/settings/settings"
import { usePollWhile } from "@/lib/usePollWhile"
import { useHistoryImport } from "./historyImport.ts"
import { ServiceRow, TextButton } from "./ServiceRow.tsx"

/** The agent CLIs Humanity runs threads on: every account, and whether it is signed in. */
export function ConnectStep() {
  const { result, refresh, refreshing, add } = useClaudeAccounts()
  const history = useHistoryImport()
  const switchId = useId()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => !isReady(account.status)) === true
  // A login made in a terminal or in the settings shows up here by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut, poll, refreshing)

  const { name, Icon } = PROVIDERS["claude-code"]
  const icon = <Icon className="size-6" aria-hidden="true" />

  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="text-center text-xl font-semibold tracking-tight">Connect your agent</h2>
      <ul className="flex flex-col gap-2">
        {accounts === undefined ? (
          <ServiceRow
            icon={icon}
            name={name}
            state={AsyncResult.isFailure(result) ? "disconnected" : undefined}
          />
        ) : (
          accounts.map((account) => {
            const connected = isReady(account.status)
            return (
              <ServiceRow
                key={account.id}
                icon={icon}
                name={accounts.length > 1 ? `${name} · ${account.name}` : name}
                state={connected ? "connected" : "disconnected"}
                detail={accountLine(account.status)}
              >
                {!connected && (
                  <TextButton onClick={() => openSettings("providers")}>
                    Open Settings to sign in
                  </TextButton>
                )}
              </ServiceRow>
            )
          })
        )}
      </ul>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Have another account?</span>
        <AddAccount provider="claude-code" onAdd={add} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={switchId} className="font-normal">
          Import your existing Claude Code threads
        </Label>
        <Switch
          id={switchId}
          checked={history.enabled}
          disabled={!history.ready}
          onCheckedChange={(checked) => void history.setEnabled(checked)}
        />
      </div>
      {history.error !== undefined && (
        <p role="alert" className="text-xs whitespace-pre-wrap text-destructive">
          {history.error}
        </p>
      )}
    </div>
  )
}
