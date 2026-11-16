import type { KiroAccount } from "@humanity/contracts"
import { CircleAlert } from "lucide-react"
import { useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PROVIDERS } from "@/features/providers/ProviderIcon"
import { RemoveAccount } from "@/features/providers/RemoveAccount"
import { kiroSignInCommand, kiroSignInUsesPowerShell, kiroTitle } from "./summary.ts"

/**
 * One Kiro account in the list of the provider's accounts: whether it is
 * signed in, or exactly what to do to sign it in, plus making it the account
 * of new threads and removing it.
 */
export function KiroAccountRow({
  account,
  onSetActive,
  onRemove,
}: {
  readonly account: KiroAccount
  /** Both resolve to an error message, or `undefined` when they worked. */
  readonly onSetActive: (accountId: string) => Promise<string | undefined>
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const { status } = account
  const connection = status.connection
  const { Icon } = PROVIDERS.kiro
  const [error, setError] = useState<string>()
  const [switching, setSwitching] = useState(false)

  const makeActive = async () => {
    setSwitching(true)
    setError(await onSetActive(account.id))
    setSwitching(false)
  }

  return (
    <section aria-live="polite" aria-label={account.name} className="flex flex-col gap-4 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="size-9" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-medium">{account.name}</h4>
            {account.active && <Badge>Default</Badge>}
          </div>
          <p className="text-sm">{kiroTitle(status)}</p>
        </div>
        <div className="flex items-center gap-1">
          {!account.active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void makeActive()}
              disabled={switching}
            >
              Set as default
            </Button>
          )}
          {!account.isDefault && !account.active && (
            <RemoveAccount
              provider="kiro"
              account={account}
              folder={status.kiroHome}
              onRemove={onRemove}
            />
          )}
        </div>
      </div>

      {error !== undefined && <ErrorNote title="Could not switch accounts" message={error} />}
      {connection._tag === "Connected" && status.kiroHome !== null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Login stored in</dt>
          <dd className="min-w-0 truncate font-medium">
            <code className="text-xs break-all">{status.kiroHome}</code>
          </dd>
        </dl>
      )}
      {connection._tag === "SignedOut" && <SignInSteps account={account} />}
      {connection._tag === "Unavailable" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>What Kiro said</AlertTitle>
          <AlertDescription>
            <pre className="font-mono text-xs whitespace-pre-wrap">{connection.reason}</pre>
            <p className="mt-2">
              Check that <code>{status.executable}</code> is on the PATH, then check again.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}

function SignInSteps({ account }: { readonly account: KiroAccount }) {
  const { status } = account
  const command = {
    kiroHome: account.isDefault ? null : status.kiroHome,
    executable: status.executable,
  }
  return (
    <ol className="flex flex-col gap-4">
      <NumberedStep
        n={1}
        title={
          kiroSignInUsesPowerShell(command) ? "Run this in PowerShell" : "Run this in a terminal"
        }
      >
        <CopyCommand command={kiroSignInCommand(command)} className="mt-1" />
      </NumberedStep>
      <NumberedStep n={2} title="Come back here">
        <span className="inline-flex items-center gap-1.5">
          <Spinner className="size-3.5" />
          Waiting for you to sign in…
        </span>
      </NumberedStep>
    </ol>
  )
}
