import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { CodexStatus } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { CircleAlert, RefreshCw } from "lucide-react"
import { useCallback, useState } from "react"
import { CopyCommand } from "@/components/CopyCommand"
import { ErrorNote } from "@/components/ErrorNote"
import { NumberedStep } from "@/components/NumberedStep"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PROVIDERS } from "@/features/providers/ProviderIcon"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { usePollWhile } from "@/lib/usePollWhile"
import { codexStatusAtom, refreshCodexStatusAtom } from "./atoms.ts"
import { codexSignInCommand, summarizeCodex } from "./summary.ts"

const reactivityKeys = [keys.codex]

/**
 * Codex among the providers: who it is signed in as, or exactly what to do to
 * sign it in. Codex has one login, the human's own, so there is no list of accounts.
 */
export function CodexSection() {
  const result = useAtomValue(codexStatusAtom)
  const check = useAtomSet(refreshCodexStatusAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string>()
  const status = AsyncResult.isSuccess(result) ? result.value : undefined

  /** `force` starts Codex again; without it the daemon's short cache answers. */
  const refresh = useCallback(
    async (force: boolean) => {
      setRefreshing(true)
      const exit = await check({ payload: { refresh: force }, reactivityKeys })
      setRefreshing(false)
      return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
    },
    [check],
  )
  // Not forced: the daemon re-checks a signed-out Codex every few seconds by itself.
  const poll = useCallback(() => void refresh(false), [refresh])
  usePollWhile(status?.connection._tag === "SignedOut", poll, refreshing)

  const { name, Icon } = PROVIDERS.codex
  const version = status?.cliVersion ?? null

  return (
    <section aria-labelledby="provider-codex" className="flex flex-col">
      <div className="flex items-center gap-2 border-b pb-3">
        <Icon className="size-4" aria-hidden="true" />
        <h3 id="provider-codex" className="text-sm font-medium">
          {name}
        </h3>
        {version !== null && <span className="text-xs text-muted-foreground">v{version}</span>}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh(true).then(setRefreshError)}
          disabled={refreshing || status === undefined}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Checking…" : "Check again"}
        </Button>
      </div>

      {AsyncResult.match(result, {
        onInitial: () => (
          <p className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground">
            <Spinner />
            Starting Codex to read which login it has. No prompt is sent.
          </p>
        ),
        onFailure: (failure) => (
          <div className="py-4">
            <ErrorNote
              title="Could not ask the daemon about Codex"
              message={describeCause(failure.cause)}
            />
          </div>
        ),
        onSuccess: ({ value }) => <CodexLogin status={value} />,
      })}
      {refreshError !== undefined && (
        <div className="pt-4">
          <ErrorNote title="Could not check again" message={refreshError} />
        </div>
      )}
    </section>
  )
}

function CodexLogin({ status }: { readonly status: CodexStatus }) {
  const summary = summarizeCodex(status)
  const connection = status.connection
  const { Icon } = PROVIDERS.codex
  return (
    <div aria-live="polite" className="flex flex-col gap-4 border-b py-4">
      <div className="flex items-start gap-3">
        <Icon className="size-9" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h4 className="truncate font-medium">
            {connection._tag === "Connected" ? connection.label : "Your Codex login"}
          </h4>
          <p className="text-sm">{summary.title}</p>
          <p className="text-sm text-muted-foreground">{summary.detail}</p>
        </div>
      </div>

      {connection._tag === "Connected" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
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
      {connection._tag === "SignedOut" && (
        <ol className="flex flex-col gap-4">
          <NumberedStep n={1} title="Open a terminal on this computer">
            Any shell works. The command runs the Codex that ships with Humanity, so the login lands
            where its threads read it.
          </NumberedStep>
          <NumberedStep n={2} title="Sign in with your ChatGPT account">
            <CopyCommand command={codexSignInCommand(status.executable)} className="mt-1" />
            <span className="mt-1 block">
              A browser window opens. Sign in with the ChatGPT account whose plan includes Codex.
            </span>
          </NumberedStep>
          <NumberedStep n={3} title="Come back here">
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              This page checks again every few seconds and updates once you are signed in.
            </span>
          </NumberedStep>
        </ol>
      )}
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
    </div>
  )
}
