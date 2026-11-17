import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AgentCli, AgentProvider } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ArrowUpCircle, ExternalLink, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { describeCause } from "@/lib/errors"
import { agentCliAtom, cliProblem, updateAgentCliAtom, updatedKeys, updateOutcome } from "./cli.ts"

export interface CliUpdate {
  readonly cli: AgentCli | undefined
  readonly run: () => void
  readonly updating: boolean
  /** What the last update did, in one line. */
  readonly outcome: string | undefined
  readonly error: string | undefined
}

/**
 * A provider's CLI and its Update button's state. Updating runs the CLI's
 * own updater, then `onUpdated`, so the accounts are checked again on it.
 */
export function useCliUpdate(provider: AgentProvider, onUpdated: () => void): CliUpdate {
  const result = useAtomValue(agentCliAtom(provider))
  const update = useAtomSet(updateAgentCliAtom, { mode: "promiseExit" })
  const [updating, setUpdating] = useState(false)
  const [outcome, setOutcome] = useState<string>()
  const [error, setError] = useState<string>()
  const cli = AsyncResult.isSuccess(result) ? result.value : undefined

  const run = async () => {
    const before = cli?.version ?? null
    setUpdating(true)
    setOutcome(undefined)
    setError(undefined)
    const exit = await update({ payload: { provider }, reactivityKeys: updatedKeys(provider) })
    setUpdating(false)
    if (Exit.isSuccess(exit)) {
      setOutcome(updateOutcome(before, exit.value.cli))
      onUpdated()
    } else setError(describeCause(exit.cause))
  }

  return { cli, run: () => void run(), updating, outcome, error }
}

function UpdateButton({
  update,
  prominent,
}: {
  readonly update: CliUpdate
  readonly prominent: boolean
}) {
  return (
    <Button
      variant={prominent ? "default" : "ghost"}
      size={prominent ? "sm" : "xs"}
      onClick={update.run}
      disabled={update.updating}
      title={update.cli === undefined ? undefined : `Runs ${update.cli.updateCommand}`}
      className={cn(!prominent && "text-muted-foreground")}
    >
      {update.updating ? <Spinner /> : <ArrowUpCircle />}
      {update.updating ? "Updating…" : "Update"}
    </Button>
  )
}

/**
 * The CLI's version in its provider's header, with a quiet Update button.
 * A CLI that needs attention gets its button in `CliNotice` instead.
 */
export function CliVersion({ update }: { readonly update: CliUpdate }) {
  const { cli } = update
  if (cli === undefined) return null
  if (cli.path === null) {
    return (
      <span className="flex items-center gap-1.5 text-warning">
        <TriangleAlert className="size-3.5" />
        Not installed
      </span>
    )
  }
  return (
    <span className={cn("flex items-center gap-1.5", cli.outdated && "text-warning")}>
      {cli.outdated && <TriangleAlert className="size-3.5" />}
      {cli.version === null ? "CLI version unknown" : `CLI v${cli.version}`}
      {!cli.outdated && <UpdateButton update={update} prominent={false} />}
    </span>
  )
}

/**
 * Under a provider's header: why its CLI needs attention (missing, or older
 * than Humanity is tested with) with the way out, then what the last update did.
 */
export function CliNotice({ update }: { readonly update: CliUpdate }) {
  const { cli } = update
  const problem = cli === undefined ? undefined : cliProblem(cli)
  return (
    <>
      {cli !== undefined && problem !== undefined && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">{problem}</p>
          {cli.path === null ? (
            <Button variant="outline" size="sm" asChild>
              <a href={cli.installUrl} target="_blank" rel="noreferrer">
                How to install
                <ExternalLink />
              </a>
            </Button>
          ) : (
            <UpdateButton update={update} prominent />
          )}
        </div>
      )}
      {update.outcome !== undefined && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {update.outcome}
        </p>
      )}
      {update.error !== undefined && (
        <ErrorNote title="The update did not finish" message={update.error} />
      )}
    </>
  )
}
