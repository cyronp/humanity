import { cn } from "cn"
import { KeyRound, Monitor, Server, X } from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { BrandMark } from "@/components/BrandMark"
import { CopyCommand } from "@/components/CopyCommand"
import { NumberedStep } from "@/components/NumberedStep"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { currentSurroundings, daemonAddress, retryDelayMs, startCommand } from "@/lib/connection"
import { storeToken, tokenFromInput } from "@/lib/token"
import { APP_VERSION } from "@/lib/version"

/**
 * The page every connect screen sits on: the splash's colour, so going from
 * the splash to one of these does not flash, and a column in the middle.
 */
function ConnectFrame({ children }: { readonly children: ReactNode }) {
  return (
    <main className="titlebar flex min-h-svh flex-col items-center bg-sidebar px-4 pt-[calc(var(--titlebar-height)+--spacing(6))] pb-6">
      <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 text-center duration-300 animate-in fade-in-0 slide-in-from-bottom-2">
        {children}
      </div>
      {APP_VERSION !== undefined && (
        <p className="text-xs text-muted-foreground/70">Humanity {APP_VERSION}</p>
      )}
    </main>
  )
}

function Heading({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-sm text-balance text-muted-foreground">{children}</p>
    </div>
  )
}

/** `down`: nothing answered; `refused`: it answered and turned the token down. */
type LinkState = "down" | "refused" | "checking"

/**
 * This window on the left, the daemon on the right, and what stands between
 * them: the picture says which end the trouble is at before the text does.
 */
function LinkDiagram({
  state,
  from,
  to,
  address,
}: {
  readonly state: LinkState
  readonly from: string
  readonly to: string
  readonly address?: string | undefined
}) {
  const badge = {
    checking: {
      icon: <Spinner aria-hidden="true" className="size-3.5" />,
      className: "text-muted-foreground",
      label: "Looking for it",
    },
    down: {
      icon: <X className="size-3.5" strokeWidth={2.5} />,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      label: "Not answering",
    },
    refused: {
      icon: <KeyRound className="size-3.5" />,
      className: "border-warning/40 bg-warning/10 text-warning",
      label: "Token refused",
    },
  }[state]
  return (
    <figure
      className="flex w-full max-w-xs items-start"
      aria-label={`${from} to ${to}: ${badge.label}`}
    >
      <DiagramNode icon={<Monitor />} label={from} />
      <div className="relative mt-5 flex-1" aria-hidden="true">
        <div
          className={cn(
            "border-t-2",
            state === "refused" ? "border-solid border-border" : "border-dashed border-border",
          )}
        />
        {/* Solid underneath, so the line stops at the badge instead of showing through its tint. */}
        <span className="absolute top-0 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background">
          <span
            className={cn("grid size-full place-items-center rounded-full border", badge.className)}
          >
            {badge.icon}
          </span>
        </span>
      </div>
      <DiagramNode icon={<Server />} label={to} detail={address} faded={state !== "refused"} />
    </figure>
  )
}

function DiagramNode({
  icon,
  label,
  detail,
  faded = false,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly detail?: string | undefined
  readonly faded?: boolean
}) {
  return (
    <div className="flex w-28 shrink-0 flex-col items-center gap-2">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl border bg-background shadow-xs [&_svg]:size-4.5",
          faded && "text-muted-foreground/60",
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        {detail !== undefined && (
          <span className="font-mono text-[11px] text-muted-foreground">{detail}</span>
        )}
      </span>
    </div>
  )
}

/** A panel of left-aligned content under the centred heading. */
function Panel({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn("w-full rounded-xl border bg-card text-left shadow-xs", className)}>
      {children}
    </div>
  )
}

export function UnreachableScreen({
  checking,
  failures,
  onRetry,
}: {
  readonly checking: boolean
  readonly failures: number
  readonly onRetry: () => void
}) {
  const surroundings = currentSurroundings()
  const command = startCommand(surroundings)
  const desktop = surroundings === "desktop"
  return (
    <ConnectFrame>
      <LinkDiagram
        state={checking ? "checking" : "down"}
        from={desktop ? "Humanity" : "This window"}
        to={desktop ? "Background service" : "Daemon"}
        address={desktop ? undefined : daemonAddress()}
      />
      <Heading title="Can't reach Humanity">
        {desktop ? (
          <>Humanity's background service stopped answering. The app restarts it on its own.</>
        ) : (
          <>
            Nothing answered at <code className="text-foreground">{daemonAddress()}</code>, so the
            daemon is probably not running.
          </>
        )}
      </Heading>
      <Panel>
        <div className="p-4">
          {command === undefined ? (
            <p className="text-sm text-muted-foreground">
              If this lasts more than a few seconds, quit Humanity and open it again.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              <NumberedStep n={1} title="Start the daemon">
                <div className="flex flex-col gap-2">
                  <span>From the repository's folder, run:</span>
                  <CopyCommand command={command} className="bg-muted/40" />
                </div>
              </NumberedStep>
              <NumberedStep n={2} title="Come back to this page">
                It connects by itself as soon as the daemon answers.
              </NumberedStep>
            </ol>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
          <span
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            {checking ? (
              <>
                <Spinner aria-hidden="true" className="size-3.5" />
                Looking for the daemon…
              </>
            ) : (
              // A new key restarts the countdown after every look.
              <Countdown key={failures} ms={retryDelayMs(failures)} onDone={onRetry} />
            )}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={checking}>
            Try now
          </Button>
        </div>
      </Panel>
    </ConnectFrame>
  )
}

function Countdown({ ms, onDone }: { readonly ms: number; readonly onDone: () => void }) {
  const [seconds, setSeconds] = useState(() => Math.ceil(ms / 1000))
  useEffect(() => {
    const deadline = Date.now() + ms
    const timer = window.setInterval(() => {
      const left = deadline - Date.now()
      if (left > 0) return setSeconds(Math.ceil(left / 1000))
      window.clearInterval(timer)
      onDone()
    }, 250)
    return () => window.clearInterval(timer)
  }, [ms, onDone])
  return (
    <>
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      Trying again in <span className="-ml-1 tabular-nums">{seconds}s</span>
    </>
  )
}

export function TokenScreen({
  rejected,
  checking,
  onSubmit,
}: {
  readonly rejected: boolean
  readonly checking: boolean
  readonly onSubmit: () => void
}) {
  return (
    <ConnectFrame>
      {rejected ? (
        <LinkDiagram state="refused" from="This window" to="Daemon" address={daemonAddress()} />
      ) : (
        <BrandMark className="size-16" />
      )}
      <Heading title={rejected ? "That token didn't work" : "Connect to Humanity"}>
        {rejected ? (
          <>The daemon answered but turned this token down. It may have made a new one since.</>
        ) : (
          <>Paste the link the daemon printed when it started.</>
        )}
      </Heading>
      <TokenForm checking={checking} onSubmit={onSubmit} />
      <p className="text-xs text-balance text-muted-foreground">
        The link is in the terminal that runs the daemon. The token alone is also in{" "}
        <code className="text-foreground">~/.humanity/auth-token</code>.
      </p>
    </ConnectFrame>
  )
}

function TokenForm({
  checking,
  onSubmit,
}: {
  readonly checking: boolean
  readonly onSubmit: () => void
}) {
  const [value, setValue] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim() === "") return
    storeToken(tokenFromInput(value))
    onSubmit()
  }
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2">
      <label htmlFor="token" className="sr-only">
        Link or token
      </label>
      <div className="flex gap-2">
        <Input
          id="token"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="http://127.0.0.1:7420/?token=…"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="h-10 bg-background font-mono text-sm"
        />
        <Button
          type="submit"
          variant="brand"
          className="h-10 px-4"
          disabled={checking || value.trim() === ""}
        >
          {checking && <Spinner aria-hidden="true" />}
          Connect
        </Button>
      </div>
    </form>
  )
}
