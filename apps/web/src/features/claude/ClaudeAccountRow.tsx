import type { ClaudeAccount, ClaudeConnection, ClaudeStatus } from "@humanity/contracts"
import { ChevronDown, CircleAlert, KeyRound } from "lucide-react"
import { type ReactNode, useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { RemoveAccount } from "@/features/providers/RemoveAccount"
import { ClaudeMark } from "./ClaudeMark.tsx"
import { connectionFacts, signInCommand, summarizeClaude } from "./summary.ts"

/**
 * One Claude account in the list of a provider's accounts: who it is signed
 * in as, or exactly what to do to sign it in, plus making it the account of
 * new threads and removing it.
 */
export function ClaudeAccountRow({
  account,
  onSetActive,
  onRemove,
}: {
  readonly account: ClaudeAccount
  /** Both resolve to an error message, or `undefined` when they worked. */
  readonly onSetActive: (accountId: string) => Promise<string | undefined>
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const { status } = account
  const summary = summarizeClaude(status)
  const connection = status.connection
  const subtitle = subtitleFor(account, connection)
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
        <ClaudeMark className="size-9" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-medium">{account.name}</h4>
            {account.active && <Badge>Default</Badge>}
          </div>
          <p className="text-sm">{summary.title}</p>
          {subtitle !== null && <p className="text-sm text-muted-foreground">{subtitle}</p>}
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
              provider="claude-code"
              account={account}
              folder={status.configDir}
              onRemove={onRemove}
            />
          )}
        </div>
      </div>

      {error !== undefined && <ErrorNote title="Could not switch accounts" message={error} />}
      {connection._tag === "Connected" && <ConnectedDetails status={status} />}
      {connection._tag === "Connected" && connection.subscriptionShadowed && <ShadowedNote />}
      {connection._tag === "SignedOut" && <SignInSteps account={account} />}
      {connection._tag === "Unavailable" && <UnavailableNote reason={connection.reason} />}
    </section>
  )
}

const subtitleFor = (account: ClaudeAccount, connection: ClaudeConnection): string | null => {
  switch (connection._tag) {
    case "Connected":
      return connection.method === "subscription"
        ? null
        : "Billed to this credential, not to a Claude plan."
    case "SignedOut":
      if (account.isDefault) return null
      return account.linkedFolder ? "This folder has no login yet." : null
    case "Unavailable":
      return null
  }
}

function ConnectedDetails({ status }: { readonly status: ClaudeStatus }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {connectionFacts(status).map(({ label, value }) => (
        <DetailRow key={label} label={label}>
          {value}
        </DetailRow>
      ))}
      <DetailRow label="Login stored in">
        <code className="text-xs break-all">{status.configDir}</code>
      </DetailRow>
    </dl>
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

function ShadowedNote() {
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>An API key overrides your subscription</AlertTitle>
      <AlertDescription>
        Usage is billed per token. To use your plan, unset <code>ANTHROPIC_API_KEY</code> and
        restart the daemon.
      </AlertDescription>
    </Alert>
  )
}

function SignInSteps({ account }: { readonly account: ClaudeAccount }) {
  const { status } = account
  const configDir = account.isDefault ? null : status.configDir
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        <NumberedStep n={1} title="Run this in a terminal">
          <CopyCommand command={signInCommand({ configDir, executable: null })} className="mt-1" />
          <span className="mt-1 block">
            Choose your Claude Pro, Max, Team or Enterprise account in the browser.{" "}
            {!account.isDefault && "If it picks the wrong one, sign out of claude.ai first."}
          </span>
        </NumberedStep>
        <NumberedStep n={2} title="Come back here">
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3.5" />
            Waiting for you to sign in…
          </span>
        </NumberedStep>
      </ol>
      {status.bundledExecutable !== null && (
        <Collapsible className="rounded-lg border px-3 py-2 text-sm">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left font-medium">
            <span>
              No <code>claude</code> command on this computer?
            </span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 pt-2 text-muted-foreground">
            <p>Use the copy that ships with Humanity:</p>
            <CopyCommand
              command={signInCommand({ configDir, executable: status.bundledExecutable })}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
      {(account.isDefault || account.linkedFolder) && (
        <p className="text-xs text-muted-foreground">
          The login is read from <code className="break-all">{status.configDir}</code>.
          {account.isDefault && (
            <>
              {" "}
              If you use a custom <code>CLAUDE_CONFIG_DIR</code>, sign in with the same one.
            </>
          )}
        </p>
      )}
    </div>
  )
}

function UnavailableNote({ reason }: { readonly reason: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>What Claude Code said</AlertTitle>
      <AlertDescription>
        <pre className="font-mono text-xs whitespace-pre-wrap">{reason}</pre>
        <p className="mt-2">
          Run <code>npm install</code> from the repository root, then restart the daemon.
        </p>
      </AlertDescription>
    </Alert>
  )
}
