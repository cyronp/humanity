import type { ClaudeConnection, ClaudeStatus } from "@humanity/contracts"
import { cn } from "cn"
import { ChevronDown, CircleAlert, KeyRound, LoaderCircle, RefreshCw } from "lucide-react"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useEffect, useRef } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { describeCause } from "@/lib/errors"
import { ClaudeMark } from "./ClaudeMark.tsx"
import { bundledLoginCommand, summarizeClaude } from "./summary.ts"
import { ToneDot } from "./ToneDot.tsx"
import { useClaudeStatus } from "./useClaudeStatus.ts"

/** While signed out, check again on this interval so a fresh login shows up by itself. */
const SIGNED_OUT_POLL_MS = 5000

/**
 * Everything about the Claude connection in one place: which account the
 * agent runs as, or exactly what to do to connect one.
 */
export function ClaudeConnectionPanel() {
  const { result, refresh, refreshing, refreshError } = useClaudeStatus()
  const signedOut = AsyncResult.isSuccess(result) && result.value.connection._tag === "SignedOut"
  useSignedOutPolling(signedOut, refresh, refreshing)

  return (
    <div className="flex flex-col gap-4">
      {AsyncResult.match(result, {
        onInitial: () => <CheckingState />,
        onFailure: (failure) => (
          <ErrorNote
            title="Could not ask the daemon about Claude"
            message={describeCause(failure.cause)}
          />
        ),
        onSuccess: ({ value }) => (
          <StatusView status={value} refresh={refresh} refreshing={refreshing} />
        ),
      })}
      {refreshError !== undefined && (
        <ErrorNote title="Could not check again" message={refreshError} />
      )}
    </div>
  )
}

function useSignedOutPolling(active: boolean, refresh: () => Promise<void>, busy: boolean) {
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      if (!busyRef.current) void refresh()
    }, SIGNED_OUT_POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, refresh])
}

function CheckingState() {
  return (
    <PanelFrame tone="pending">
      <PanelHeading
        title="Checking your Claude account…"
        subtitle="Humanity is starting Claude Code to read which login it uses. No prompt is sent."
        icon={<LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
      />
    </PanelFrame>
  )
}

function StatusView({
  status,
  refresh,
  refreshing,
}: {
  readonly status: ClaudeStatus
  readonly refresh: () => Promise<void>
  readonly refreshing: boolean
}) {
  const summary = summarizeClaude(status)
  const connection = status.connection
  const checkAgain = (
    <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
      <RefreshCw className={cn(refreshing && "animate-spin")} />
      {refreshing ? "Checking…" : "Check again"}
    </Button>
  )

  return (
    <PanelFrame tone={summary.tone}>
      <PanelHeading
        title={summary.title}
        subtitle={subtitleFor(connection)}
        icon={<ToneDot tone={summary.tone} className="size-2.5" />}
        action={checkAgain}
      />
      {connection._tag === "Connected" && <ConnectedDetails status={status} />}
      {connection._tag === "Connected" && connection.subscriptionShadowed && <ShadowedNote />}
      {connection._tag === "SignedOut" && <SignInSteps status={status} />}
      {connection._tag === "Unavailable" && <UnavailableNote reason={connection.reason} />}
    </PanelFrame>
  )
}

const subtitleFor = (connection: ClaudeConnection): string => {
  switch (connection._tag) {
    case "Connected":
      return connection.method === "subscription"
        ? "Agent sessions run on your plan, exactly like Claude Code in your terminal."
        : "Agent sessions run on this credential. Usage is billed to it, not to a Claude plan."
    case "SignedOut":
      return "Sign in once with Claude Code. Humanity picks the login up automatically."
    case "Unavailable":
      return "Humanity runs Claude Code through the Agent SDK, and it did not start."
  }
}

function ConnectedDetails({ status }: { readonly status: ClaudeStatus }) {
  const connection = status.connection
  if (connection._tag !== "Connected") return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <DetailRow label={connection.method === "subscription" ? "Plan" : "Credential"}>
        {connection.label}
      </DetailRow>
      {connection.email !== null && <DetailRow label="Account">{connection.email}</DetailRow>}
      {connection.organization !== null && (
        <DetailRow label="Organization">{connection.organization}</DetailRow>
      )}
      <DetailRow label="Claude Code">
        {status.cliVersion === null ? "bundled" : `v${status.cliVersion}, bundled with Humanity`}
      </DetailRow>
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
      <AlertTitle>Your subscription is signed in, but not used</AlertTitle>
      <AlertDescription>
        Claude Code prefers an API key over a subscription login, so this key is billed per token.
        To run on your plan, remove <code>ANTHROPIC_API_KEY</code> from the environment you start
        Humanity from, restart the daemon and check again.
      </AlertDescription>
    </Alert>
  )
}

function SignInSteps({ status }: { readonly status: ClaudeStatus }) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        <SignInStep n={1} title="Open a terminal on this computer">
          Any shell works. Humanity and Claude Code share the same login.
        </SignInStep>
        <SignInStep n={2} title="Sign in with your Claude account">
          <CopyCommand command="claude auth login" className="mt-1" />
          <span className="mt-1 block">
            A browser window opens. Choose your Claude Pro, Max, Team or Enterprise account.
          </span>
        </SignInStep>
        <SignInStep n={3} title="Come back here">
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin" />
            This page checks again every few seconds and continues once you are signed in.
          </span>
        </SignInStep>
      </ol>
      {status.bundledExecutable !== null && (
        <Collapsible className="rounded-lg border px-3 py-2 text-sm">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left font-medium">
            No <code>claude</code> command on this computer?
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 pt-2 text-muted-foreground">
            <p>
              Humanity ships its own copy of Claude Code. Sign in with it instead (PowerShell on
              Windows):
            </p>
            <CopyCommand command={bundledLoginCommand(status.bundledExecutable)} />
          </CollapsibleContent>
        </Collapsible>
      )}
      <p className="text-xs text-muted-foreground">
        The login is read from <code className="break-all">{status.configDir}</code>. If you use a
        custom <code>CLAUDE_CONFIG_DIR</code>, sign in with the same one.
      </p>
    </div>
  )
}

function SignInStep({
  n,
  title,
  children,
}: {
  readonly n: number
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
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

function PanelFrame({
  tone,
  children,
}: {
  readonly tone: "ok" | "warning" | "error" | "pending"
  readonly children: ReactNode
}) {
  return (
    <section
      aria-live="polite"
      className={cn(
        "flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs",
        tone === "ok" && "border-emerald-500/30",
        tone === "warning" && "border-amber-500/40",
        tone === "error" && "border-destructive/40",
      )}
    >
      {children}
    </section>
  )
}

function PanelHeading({
  title,
  subtitle,
  icon,
  action,
}: {
  readonly title: string
  readonly subtitle: string
  readonly icon: ReactNode
  readonly action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="relative">
        <ClaudeMark className="size-11" />
        <span className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-card">
          {icon}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}
