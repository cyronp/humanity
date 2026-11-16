import type { ClaudeAccount } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { RefreshCw } from "lucide-react"
import { useCallback, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ClaudeAccountRow } from "@/features/claude/ClaudeAccountRow"
import { useClaudeAccounts } from "@/features/claude/useClaudeAccounts"
import { CodexSection } from "@/features/codex/CodexSection"
import { describeCause } from "@/lib/errors"
import { usePollWhile } from "@/lib/usePollWhile"
import { AddAccount } from "./AddAccount.tsx"
import { PROVIDERS } from "./ProviderIcon.tsx"

/**
 * Every provider Humanity can run sessions on, with its accounts: which one
 * new threads use, who each is signed in as, and how to add another.
 */
export function ProvidersOverview() {
  const { result, refresh, refreshing, add, remove, setActive } = useClaudeAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  // Not forced: the daemon re-checks a signed-out account every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  const { name, Icon } = PROVIDERS["claude-code"]
  const version = accounts?.[0]?.status.cliVersion ?? null

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="provider-claude-code" className="flex flex-col">
        <div className="flex items-center gap-2 border-b pb-3">
          <Icon className="size-4" aria-hidden="true" />
          <h3 id="provider-claude-code" className="text-sm font-medium">
            {name}
          </h3>
          <span className="text-xs text-muted-foreground">
            {version === null ? "bundled with Humanity" : `v${version}, bundled with Humanity`}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => void refresh(true).then(setRefreshError)}
            disabled={refreshing || accounts === undefined}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Checking…" : "Check again"}
          </Button>
        </div>

        {AsyncResult.match(result, {
          onInitial: () => (
            <p className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground">
              <Spinner />
              Starting Claude Code to read which logins it has. No prompt is sent.
            </p>
          ),
          onFailure: (failure) => (
            <div className="py-4">
              <ErrorNote
                title="Could not ask the daemon about the accounts"
                message={describeCause(failure.cause)}
              />
            </div>
          ),
          onSuccess: ({ value }) => (
            <AccountList accounts={value} onSetActive={setActive} onRemove={remove} />
          ),
        })}
        {refreshError !== undefined && (
          <div className="pt-4">
            <ErrorNote title="Could not check again" message={refreshError} />
          </div>
        )}
        {accounts !== undefined && (
          <div className="pt-4">
            <AddAccount provider="claude-code" onAdd={add} />
          </div>
        )}
      </section>

      <CodexSection />

      <p className="text-xs text-muted-foreground">
        The model you pick for a new thread decides which provider it runs on, for good: its
        conversation is stored by that provider. A {name} thread runs as the account marked “Used
        for new threads”, and keeps that account too.
      </p>
    </div>
  )
}

function AccountList({
  accounts,
  onSetActive,
  onRemove,
}: {
  readonly accounts: ReadonlyArray<ClaudeAccount>
  readonly onSetActive: (accountId: string) => Promise<string | undefined>
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  return (
    <ul className="divide-y border-b">
      {accounts.map((account) => (
        <li key={account.id}>
          <ClaudeAccountRow account={account} onSetActive={onSetActive} onRemove={onRemove} />
        </li>
      ))}
    </ul>
  )
}
