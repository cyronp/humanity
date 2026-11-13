import type { ClaudeAccount, ClaudeConnection, ClaudeStatus } from "@humanity/contracts"
import { ChevronDown, CircleAlert, KeyRound, LoaderCircle, Trash2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ClaudeMark } from "./ClaudeMark.tsx"
import { connectionFacts, signInCommand, summarizeClaude } from "./summary.ts"
import { ToneDot } from "./ToneDot.tsx"

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
        <div className="relative">
          <ClaudeMark className="size-9" />
          <span className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-popover">
            <ToneDot tone={summary.tone} className="size-2.5" />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-medium">{account.name}</h4>
            {account.active && <Badge>Used for new threads</Badge>}
          </div>
          <p className="text-sm">{summary.title}</p>
          <p className="text-sm text-muted-foreground">{subtitleFor(account, connection)}</p>
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
          {!account.isDefault && <RemoveAccount account={account} onRemove={onRemove} />}
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

const subtitleFor = (account: ClaudeAccount, connection: ClaudeConnection): string => {
  switch (connection._tag) {
    case "Connected":
      return connection.method === "subscription"
        ? "Sessions run on this plan, exactly like Claude Code in a terminal."
        : "Sessions run on this credential. Usage is billed to it, not to a Claude plan."
    case "SignedOut":
      if (account.isDefault) {
        return "Sign in once with Claude Code. Humanity picks the login up automatically."
      }
      return account.linkedFolder
        ? "This folder has no login yet. Sign in to it with the command below."
        : "Sign in to this account with the command below. It gets a login of its own, next to your default one."
    case "Unavailable":
      return "Humanity runs Claude Code through the Agent SDK, and it did not start."
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
      <AlertTitle>The subscription is signed in, but not used</AlertTitle>
      <AlertDescription>
        Claude Code prefers an API key over a subscription login, so this key is billed per token.
        To run on the plan, remove <code>ANTHROPIC_API_KEY</code> from the environment you start
        Humanity from, restart the daemon and check again.
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
        <NumberedStep n={1} title="Open a terminal on this computer">
          {account.isDefault
            ? "Any shell works. Humanity and Claude Code share the same login."
            : "The command points Claude Code at this account's own folder, so your default login is left alone."}
        </NumberedStep>
        <NumberedStep n={2} title="Sign in with the Claude account">
          <CopyCommand command={signInCommand({ configDir, executable: null })} className="mt-1" />
          <span className="mt-1 block">
            A browser window opens. Choose the Claude Pro, Max, Team or Enterprise account
            {account.isDefault
              ? "."
              : " you want here; sign out of claude.ai first if it picks the wrong one."}
          </span>
        </NumberedStep>
        <NumberedStep n={3} title="Come back here">
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin" />
            This page checks again every few seconds and updates once you are signed in.
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
            <p>Humanity ships its own copy of Claude Code. Sign in with it instead:</p>
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
          Reinstall dependencies with <code>npm install</code> from the repository root, then
          restart the daemon. The daemon log has the full error.
        </p>
      </AlertDescription>
    </Alert>
  )
}

/** Asks before removing: the account's login goes with it. */
function RemoveAccount({
  account,
  onRemove,
}: {
  readonly account: ClaudeAccount
  readonly onRemove: (accountId: string) => Promise<string | undefined>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState(false)

  const confirm = async () => {
    setRemoving(true)
    const failure = await onRemove(account.id)
    setRemoving(false)
    setError(failure)
    if (failure === undefined) setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(undefined)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove account “${account.name}”`}
            >
              <Trash2 />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Remove account</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove “{account.name}”?</DialogTitle>
          <DialogDescription>
            {account.linkedFolder ? (
              <>
                Humanity stops using it. Its folder{" "}
                <code className="break-all">{account.status.configDir}</code> stays as it is, with
                its login and conversations.
              </>
            ) : (
              "Its login and the conversations Claude Code kept for it are deleted from this computer."
            )}{" "}
            Ended threads that ran as it stay readable. The Claude account itself is not touched.
          </DialogDescription>
        </DialogHeader>
        {error !== undefined && <ErrorNote title="Could not remove the account" message={error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => void confirm()} disabled={removing}>
            Remove account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
