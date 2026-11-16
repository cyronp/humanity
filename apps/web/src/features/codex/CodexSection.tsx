import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { RefreshCw } from "lucide-react"
import { useCallback, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AddAccount } from "@/features/providers/AddAccount"
import { PROVIDERS } from "@/features/providers/ProviderIcon"
import { describeCause } from "@/lib/errors"
import { usePollWhile } from "@/lib/usePollWhile"
import { CodexAccountRow } from "./CodexAccountRow.tsx"
import { useCodexAccounts } from "./useCodexAccounts.ts"

/**
 * Codex among the providers, with its accounts: which one new threads use,
 * who each is signed in as, and how to add another.
 */
export function CodexSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useCodexAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  // Not forced: the daemon re-checks a signed-out account every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  const { name, Icon } = PROVIDERS.codex
  const version = accounts?.[0]?.status.cliVersion ?? null

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="provider-codex" className="flex flex-col">
        <div className="flex items-center gap-2 border-b pb-3">
          <Icon className="size-4" aria-hidden="true" />
          <h3 id="provider-codex" className="text-sm font-medium">
            {name}
          </h3>
          {version !== null && <span className="text-xs text-muted-foreground">v{version}</span>}
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
              Starting Codex to read which logins it has. No prompt is sent.
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
            <ul className="divide-y border-b">
              {value.map((account) => (
                <li key={account.id}>
                  <CodexAccountRow account={account} onSetActive={setActive} onRemove={remove} />
                </li>
              ))}
            </ul>
          ),
        })}
        {refreshError !== undefined && (
          <div className="pt-4">
            <ErrorNote title="Could not check again" message={refreshError} />
          </div>
        )}
        {accounts !== undefined && (
          <div className="pt-4">
            <AddAccount provider="codex" onAdd={add} />
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        A new {name} thread runs as the account marked “Used for new threads”. A thread keeps the
        account it started with, because its conversation is stored with that login.
      </p>
    </div>
  )
}
