import type { CodexAccount } from "@humanity/contracts"
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
import { codexSignInCommand, codexSignInUsesPowerShell, summarizeCodex } from "./summary.ts"

/**
 * One Codex account in the list of the provider's accounts: who it is signed
 * in as, or exactly what to do to sign it in, plus making it the account of
 * new threads and removing it.
 */
export function CodexAccountRow({
  account,
  onSetActive,
  onRemove,
}: {
  readonly account: CodexAccount
  /** Both resolve to an error message, or `undefined` when they worked. */
  readonly onSetActive: (accountId: string) => Promise<string | undefined>
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const { status } = account
  const summary = summarizeCodex(status)
  const connection = status.connection
  const { Icon } = PROVIDERS.codex
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
            {account.active && <Badge>Used for new threads</Badge>}
          </div>
          <p className="text-sm">{summary.title}</p>
          <p className="text-sm text-muted-foreground">{summary.detail}</p>
        </div>
        <div className="flex items-center gap-1">
          {!account.active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void makeActive()}
              disabled={switching}
            >
              Use for new threads
            </Button>
          )}
          {!account.isDefault && (
            <RemoveAccount
              provider="codex"
              account={account}
              folder={status.codexHome}
              onRemove={onRemove}
            />
          )}
        </div>
      </div>

      {error !== undefined && <ErrorNote title="Could not switch accounts" message={error} />}
      {connection._tag === "Connected" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">
            {connection.method === "chatgpt" ? "Plan" : "Credential"}
          </dt>
          <dd className="min-w-0 truncate font-medium">{connection.label}</dd>
          {connection.email !== null && (
            <>
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="min-w-0 truncate font-medium">{connection.email}</dd>
            </>
          )}
          {status.codexHome !== null && (
            <>
              <dt className="text-muted-foreground">Login stored in</dt>
              <dd className="min-w-0 truncate font-medium">
                <code className="text-xs break-all">{status.codexHome}</code>
              </dd>
            </>
          )}
        </dl>
      )}
      {connection._tag === "SignedOut" && <SignInSteps account={account} />}
      {connection._tag === "Unavailable" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>What Codex said</AlertTitle>
          <AlertDescription>
            <pre className="font-mono text-xs whitespace-pre-wrap">{connection.reason}</pre>
            <p className="mt-2">
              Reinstall dependencies with <code>npm install</code> from the repository root, then
              restart the daemon. The daemon log has the full error.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}

function SignInSteps({ account }: { readonly account: CodexAccount }) {
  const { status } = account
  const command = {
    codexHome: account.isDefault ? null : status.codexHome,
    executable: status.executable,
  }
  return (
    <ol className="flex flex-col gap-4">
      <NumberedStep n={1} title="Open a terminal on this computer">
        {codexSignInUsesPowerShell(command) ? "Use PowerShell." : "Any shell works."} The command
        runs the Codex that ships with Humanity
        {account.isDefault
          ? ", so the login lands where its threads read it."
          : ", pointed at this account's own folder, so your default login is left alone."}
      </NumberedStep>
      <NumberedStep n={2} title="Sign in with the ChatGPT account">
        <CopyCommand command={codexSignInCommand(command)} className="mt-1" />
        <span className="mt-1 block">
          A browser window opens. Sign in with the ChatGPT account whose plan includes Codex
          {account.isDefault ? "." : "; sign out of chatgpt.com first if it picks the wrong one."}
        </span>
      </NumberedStep>
      <NumberedStep n={3} title="Come back here">
        <span className="inline-flex items-center gap-1.5">
          <Spinner className="size-3.5" />
          This page checks again every few seconds and updates once you are signed in.
        </span>
      </NumberedStep>
    </ol>
  )
}
