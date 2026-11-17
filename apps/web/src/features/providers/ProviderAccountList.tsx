import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { RefreshCw } from "lucide-react"
import type { ReactNode } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { describeCause } from "@/lib/errors"
import { AddAccount } from "./AddAccount.tsx"
import { CliNotice, CliVersion, useCliUpdate } from "./CliStatus.tsx"
import { PROVIDERS, type ProviderId } from "./ProviderIcon.tsx"

/**
 * A provider's accounts: its CLI's version (with the button that updates it)
 * and the buttons that check again and add an account, then a row per
 * account. A CLI that is missing or outdated is called out under the header.
 */
export function ProviderAccountList<Account extends { readonly id: string }>({
  provider,
  result,
  refreshing,
  refreshError,
  onRefresh,
  onAdd,
  renderAccount,
}: {
  readonly provider: ProviderId
  readonly result: AsyncResult.AsyncResult<ReadonlyArray<Account>, unknown>
  readonly refreshing: boolean
  readonly refreshError: string | undefined
  readonly onRefresh: () => void
  readonly onAdd: Parameters<typeof AddAccount>[0]["onAdd"]
  readonly renderAccount: (account: Account) => ReactNode
}) {
  const { name, beta } = PROVIDERS[provider]
  const loaded = AsyncResult.isSuccess(result)
  const cli = useCliUpdate(provider, onRefresh)

  return (
    <section aria-label={`${name} accounts`} className="flex flex-col gap-4">
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            <CliVersion update={cli} />
            {beta && (
              <span className="rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
                Beta
              </span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing || !loaded}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Checking…" : "Check again"}
          </Button>
          {loaded && <AddAccount provider={provider} onAdd={onAdd} />}
        </div>

        <div className="pt-3 empty:hidden">
          <CliNotice update={cli} />
        </div>

        {AsyncResult.match(result, {
          onInitial: () => (
            <p className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground">
              <Spinner />
              Checking accounts…
            </p>
          ),
          onFailure: (failure) => (
            <div className="py-4">
              <ErrorNote title="Could not load accounts" message={describeCause(failure.cause)} />
            </div>
          ),
          onSuccess: ({ value }) => (
            <ul className="flex flex-col divide-y border-b">
              {value.map((account) => (
                <li key={account.id}>{renderAccount(account)}</li>
              ))}
            </ul>
          ),
        })}
      </div>

      {refreshError !== undefined && (
        <ErrorNote title="Could not check again" message={refreshError} />
      )}
    </section>
  )
}
