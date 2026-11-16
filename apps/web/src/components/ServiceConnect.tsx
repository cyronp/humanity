import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { RefreshCw } from "lucide-react"
import { type ReactNode, useCallback, useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToneDot } from "@/features/claude/ToneDot"
import { describeCause } from "@/lib/errors"
import { usePollWhile } from "@/lib/usePollWhile"

/** What every repository service's connection says about itself. */
interface ServiceConnection {
  /** How it is connected; `null` while it is not. */
  readonly source: string | null
  /** Why the service turned the login down, if it did. */
  readonly problem: string | null
}

/**
 * A repository service (GitHub, GitLab) in the settings: its name and how it
 * is connected, a button to check again, then the ways to connect it. While
 * there is no token at all it checks again by itself: then a check is a local
 * lookup, no request to the service.
 */
export function ServiceConnect<C extends ServiceConnection, E>({
  name,
  icon,
  result,
  refresh,
  refreshing,
  summary,
  avatarUrl,
  problemTitle,
  children,
}: {
  readonly name: string
  readonly icon: ReactNode
  readonly result: AsyncResult.AsyncResult<C, E>
  /** Resolves to an error message, or `undefined` when it worked. */
  readonly refresh: () => Promise<string | undefined>
  readonly refreshing: boolean
  readonly summary: (connection: C) => {
    readonly tone: "ok" | "warning" | "error"
    readonly title: string
  }
  readonly avatarUrl: (connection: C) => string | null
  readonly problemTitle: (connection: C) => string
  /** The ways to connect it; `waiting` while it checks again by itself. */
  readonly children: (connection: C, waiting: boolean) => ReactNode
}) {
  const [refreshError, setRefreshError] = useState<string>()
  const connection = AsyncResult.isSuccess(result) ? result.value : undefined
  const waiting = connection !== undefined && connection.source === null
  const poll = useCallback(() => void refresh(), [refresh])
  usePollWhile(waiting, poll, refreshing)
  const headingId = `repositories-${name.toLowerCase()}`

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="flex items-center gap-2 border-b pb-3">
        {icon}
        <h3 id={headingId} className="text-sm font-medium">
          {name}
        </h3>
        {connection !== undefined && (
          <ConnectionLine {...summary(connection)} avatarUrl={avatarUrl(connection)} />
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh().then(setRefreshError)}
          disabled={refreshing || connection === undefined}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Checking…" : "Check again"}
        </Button>
      </div>

      {AsyncResult.match(result, {
        onInitial: () => (
          <p className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground">
            <Spinner />
            Checking for a {name} login…
          </p>
        ),
        onFailure: (failure) => (
          <div className="py-4">
            <ErrorNote title={`Could not check ${name}`} message={describeCause(failure.cause)} />
          </div>
        ),
        onSuccess: ({ value }) => (
          <div className="divide-y border-b">
            {value.problem !== null && (
              <div className="py-4">
                <ErrorNote title={problemTitle(value)} message={value.problem} />
              </div>
            )}
            {children(value, waiting)}
          </div>
        ),
      })}
      {refreshError !== undefined && (
        <div className="pt-4">
          <ErrorNote title="Could not check again" message={refreshError} />
        </div>
      )}
    </section>
  )
}

function ConnectionLine({
  tone,
  title,
  avatarUrl,
}: {
  readonly tone: "ok" | "warning" | "error"
  readonly title: string
  readonly avatarUrl: string | null
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {avatarUrl === null ? (
        <ToneDot tone={tone} />
      ) : (
        <img src={avatarUrl} alt="" className="size-4 rounded-full" />
      )}
      <span className="truncate">{title}</span>
    </span>
  )
}

/**
 * How to sign in with a service's CLI: install it if it is missing, sign in
 * in a terminal, then come back.
 */
export function CliSteps({
  cliName,
  installed,
  install,
  installUrl,
  installUrlLabel,
  installFallback,
  service,
  loginCommand,
  loginHint,
  waiting,
}: {
  /** "GitHub CLI" */
  readonly cliName: string
  readonly installed: boolean
  /** The command that installs it on this computer, when there is one. */
  readonly install: string | null
  readonly installUrl: string
  readonly installUrlLabel: string
  /** The words before the link, when there is an install command: "Or download it from ". */
  readonly installFallback: string
  readonly service: string
  readonly loginCommand: string
  readonly loginHint: string
  readonly waiting: boolean
}) {
  const first = installed ? 1 : 2
  return (
    <ol className="flex flex-col gap-4">
      {!installed && (
        <NumberedStep n={1} title={`Install the ${cliName}`}>
          {install !== null && <CopyCommand command={install} className="mt-1" />}
          <span className="mt-1 block">
            {install === null ? "Follow the instructions at " : installFallback}
            <a href={installUrl} target="_blank" rel="noreferrer" className="underline">
              {installUrlLabel}
            </a>
            .
          </span>
        </NumberedStep>
      )}
      <NumberedStep n={first} title={`Sign in to ${service}`}>
        <CopyCommand command={loginCommand} className="mt-1" />
        <span className="mt-1 block">{loginHint}</span>
      </NumberedStep>
      <NumberedStep n={first + 1} title="Come back here">
        {waiting ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3.5" />
            Waiting for you to sign in…
          </span>
        ) : (
          "Press Check again once you are signed in."
        )}
      </NumberedStep>
    </ol>
  )
}
