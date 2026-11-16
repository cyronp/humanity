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
import { useKiroAccounts } from "./useKiroAccounts.ts"

/**
 * Kiro (Beta) among the providers, with its accounts: which one new threads
 * use, whether each is signed in, and how to add another.
 */
export function KiroSection() {
  const { result, refresh, refreshing, add, remove, setActive } = useKiroAccounts()
  const [refreshError, setRefreshError] = useState<string>()
  const accounts = AsyncResult.isSuccess(result) ? result.value : undefined
  const signedOut = accounts?.some((account) => account.status.connection._tag === "SignedOut")
  // Not forced: the daemon re-checks a signed-out account every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(signedOut === true, poll, refreshing)

  const { name, Icon } = PROVIDERS.kiro
  const version = accounts?.[0]?.status.cliVersion ?? null

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="provider-kiro" className="flex flex-col">
        <div className="flex items-center gap-2 border-b pb-3">
          <Icon className="size-4" aria-hidden="true" />
          <h3 id="provider-kiro" className="text-sm font-medium">
            {name}
          </h3>
          <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Beta
          </span>
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
              Starting Kiro to read which logins it has. No prompt is sent.
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
                <li key={account.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{account.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {account.status.connection._tag === "Connected"
                        ? account.status.connection.label
                        : account.status.connection._tag === "SignedOut"
                          ? `Not signed in. Run "${account.status.executable} login" in a terminal${account.linkedFolder || account.isDefault ? "" : " with KIRO_HOME set to this account's folder"}.`
                          : account.status.connection.reason}
                    </span>
                  </div>
                  {account.active ? (
                    <span className="text-xs text-muted-foreground">Used for new threads</span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void setActive(account.id)}>
                      Use for new threads
                    </Button>
                  )}
                  {!account.isDefault && !account.active && (
                    <Button variant="ghost" size="sm" onClick={() => void remove(account.id)}>
                      Remove
                    </Button>
                  )}
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
            <AddAccount provider="kiro" onAdd={add} />
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Kiro is in Beta: its agent protocol is new and not yet checked against a live Kiro
        subscription. A new {name} thread runs as the account marked “Used for new threads”. A
        thread keeps the account it started with.
      </p>
    </div>
  )
}
