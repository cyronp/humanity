import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Session, SyncStatus } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { fetchOriginAtom, syncAtom, syncStatusAtom } from "./atoms.ts"
import { isBusy } from "./state.ts"

/** How often an open thread fetches origin in the background, while the page is visible. */
const FETCH_EVERY_MS = 5 * 60_000

const commits = (count: number) => `${count} commit${count === 1 ? "" : "s"}`

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

const describeSync = (status: SyncStatus, busy: boolean): string => {
  if (status.branch === null)
    return "This thread is on a detached HEAD, so it has no branch to sync."
  if (status.target === null) {
    return `${status.branch} has no upstream, and origin has no default branch to update it from.`
  }
  const lines: Array<string> = []
  const outgoing = status.pushes ? status.ahead : 0
  if (status.behind === 0 && outgoing === 0) lines.push(`Up to date with ${status.target}.`)
  if (status.behind > 0) lines.push(`${commits(status.behind)} to pull from ${status.target}.`)
  if (outgoing > 0) lines.push(`${commits(outgoing)} to push.`)
  if (status.behind > 0 && status.ahead > 0) {
    lines.push(`This branch's ${commits(status.ahead)} will be replayed on top.`)
  }
  if (status.fetchError !== null) lines.push(`Last fetch failed: ${status.fetchError}`)
  else if (status.fetchedAt !== null) lines.push(`Checked origin at ${clock(status.fetchedAt)}.`)
  if (busy) lines.push("Wait for the agent to finish before syncing.")
  return lines.join(" ")
}

export function SyncButton({ session }: { readonly session: Session }) {
  const result = useAtomValue(syncStatusAtom(session.id))
  const fetchOrigin = useAtomSet(fetchOriginAtom, { mode: "promiseExit" })
  const sync = useAtomSet(syncAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [settled, setSettled] = useState(false)
  const busy = isBusy(session.status)

  const fetchNow = useCallback(() => {
    void fetchOrigin({
      payload: { sessionId: session.id, fetch: true },
      reactivityKeys: [keys.sync(session.id), keys.publication(session.id)],
    })
  }, [fetchOrigin, session.id])

  useEffect(() => {
    fetchNow()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchNow()
    }, FETCH_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNow()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [fetchNow])

  useEffect(() => {
    if (!settled) return
    const timer = window.setTimeout(() => setSettled(false), 2500)
    return () => window.clearTimeout(timer)
  }, [settled])

  if (!AsyncResult.isSuccess(result) || !result.value.hasRemote) return null
  const status = result.value
  const outgoing = status.pushes ? status.ahead : 0
  const unavailable = status.branch === null || status.target === null

  const onSync = async () => {
    setPending(true)
    setError(undefined)
    setSettled(false)
    const exit = await sync({
      payload: { sessionId: session.id },
      reactivityKeys: [
        keys.sync(session.id),
        keys.publication(session.id),
        keys.sessionDiff(session.id),
        keys.sessionCommits(session.id),
        keys.git(session.projectId),
      ],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
    else if (exit.value.pulled === 0 && exit.value.pushed === 0) setSettled(true)
  }

  return (
    <Popover
      open={error !== undefined}
      onOpenChange={(open) => {
        if (!open) setError(undefined)
      }}
    >
      <Tooltip>
        <PopoverAnchor asChild>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSync}
                disabled={busy || pending || unavailable}
                aria-label="Sync with origin"
              >
                <RefreshCw className={cn(pending && "animate-spin")} />
                {pending ? "Syncing…" : settled ? "Up to date" : "Sync"}
                {!pending && status.behind > 0 && (
                  <span className="flex items-center text-xs tabular-nums">
                    <ArrowDown className="size-3" />
                    {status.behind}
                  </span>
                )}
                {!pending && outgoing > 0 && (
                  <span className="flex items-center text-xs tabular-nums">
                    <ArrowUp className="size-3" />
                    {outgoing}
                  </span>
                )}
              </Button>
            </span>
          </TooltipTrigger>
        </PopoverAnchor>
        <TooltipContent className="max-w-72">{describeSync(status, busy)}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        {error !== undefined && <ErrorNote title="Sync stopped" message={error} />}
      </PopoverContent>
    </Popover>
  )
}
