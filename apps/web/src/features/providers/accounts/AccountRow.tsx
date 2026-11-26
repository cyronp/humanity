import { type AgentProvider, CLI_COMMANDS, type ProviderAccount } from "@humanity/contracts"
import { CircleAlert, KeyRound } from "lucide-react"
import { type ReactNode, useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PROVIDERS } from "@/features/providers/ProviderIcon"
import { RemoveAccount } from "@/features/providers/RemoveAccount"
import {
  connectionFacts,
  homeVariable,
  signInCommand,
  signInHint,
  signInUsesPowerShell,
  summarizeAccount,
} from "./summary.ts"

export function AccountRow({
  provider,
  account,
  onSetActive,
  onRemove,
}: {
  readonly provider: AgentProvider
  readonly account: ProviderAccount
  readonly onSetActive: (accountId: string) => Promise<string | undefined>
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const { status } = account
  const { name, Icon } = PROVIDERS[provider]
  const connection = status.connection
  const summary = summarizeAccount(provider, status)
  const detail =
    connection._tag === "SignedOut" && !account.isDefault && account.linkedFolder
      ? "This folder has no login yet."
      : summary.detail
  const facts = connectionFacts(provider, status)
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
          <p className="text-sm">{summary.title}</p>
          {detail !== null && <p className="text-sm text-muted-foreground">{detail}</p>}
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
          {!account.isDefault && (
            <RemoveAccount
              provider={provider}
              account={account}
              folder={status.home}
              onRemove={onRemove}
            />
          )}
        </div>
      </div>

      {error !== undefined && <ErrorNote title="Could not switch accounts" message={error} />}
      {connection._tag === "Connected" && (facts.length > 0 || status.home !== null) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {facts.map(({ label, value }) => (
            <DetailRow key={label} label={label}>
              {value}
            </DetailRow>
          ))}
          {status.home !== null && (
            <DetailRow label="Login stored in">
              <code className="text-xs break-all">{status.home}</code>
            </DetailRow>
          )}
        </dl>
      )}
      {connection._tag === "Connected" && connection.subscriptionShadowed && (
        <Alert>
          <KeyRound />
          <AlertTitle>An API key overrides your subscription</AlertTitle>
          <AlertDescription>
            Usage is billed per token. To use your plan, unset <code>ANTHROPIC_API_KEY</code> and
            restart the daemon.
          </AlertDescription>
        </Alert>
      )}
      {connection._tag === "SignedOut" && <SignInSteps provider={provider} account={account} />}
      {connection._tag === "Unavailable" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>What {name} said</AlertTitle>
          <AlertDescription>
            <pre className="font-mono text-xs whitespace-pre-wrap">{connection.reason}</pre>
            <p className="mt-2">
              Check that <code>{status.executable ?? CLI_COMMANDS[provider]}</code> is installed and
              on the PATH, then check again.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}

function SignInSteps({
  provider,
  account,
}: {
  readonly provider: AgentProvider
  readonly account: ProviderAccount
}) {
  const { status } = account
  const command = { home: account.isDefault ? null : status.home, executable: status.executable }
  const hint = signInHint(provider, account.isDefault)
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        <NumberedStep
          n={1}
          title={
            signInUsesPowerShell(command) ? "Run this in PowerShell" : "Run this in a terminal"
          }
        >
          <CopyCommand command={signInCommand(provider, command)} className="mt-1" />
          {hint !== null && <span className="mt-1 block">{hint}</span>}
        </NumberedStep>
        <NumberedStep n={2} title="Come back here">
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3.5" />
            Waiting for you to sign in…
          </span>
        </NumberedStep>
      </ol>
      {(account.isDefault || account.linkedFolder) && status.home !== null && (
        <p className="text-xs text-muted-foreground">
          The login is read from <code className="break-all">{status.home}</code>.
          {account.isDefault && (
            <>
              {" "}
              If you use a custom <code>{homeVariable(provider)}</code>, sign in with the same one.
            </>
          )}
        </p>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{children}</dd>
    </>
  )
}
