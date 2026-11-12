import { useAtomSet } from "@effect/atom-react"
import type { ContextUsage, SessionId, SessionUsage } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { Gauge, RefreshCw } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { describeCause } from "@/lib/errors"
import { refreshUsageAtom } from "./atoms.ts"
import {
  contextPercentUsed,
  formatTokens,
  planHeadline,
  type PlanRow,
  planRows,
  type UsageLevel,
  usageLevel,
} from "./usage.ts"

const LEVEL_CLASS: Record<UsageLevel, string> = {
  ok: "text-muted-foreground",
  notice: "text-yellow-600 dark:text-yellow-400",
  warning: "text-orange-600 dark:text-orange-400",
  critical: "text-red-600 dark:text-red-400",
}

/** Small text that floats over the transcript: a faint blurred backing keeps it readable. */
const FLOATING = "rounded-full bg-background/60 px-2 py-0.5 text-xs tabular-nums backdrop-blur-sm"

/**
 * The line above the message box: the plan's usage on the far left, a button
 * that opens every window, and the context window on the right.
 */
export function UsageMeters({
  sessionId,
  usage,
}: {
  readonly sessionId: SessionId
  readonly usage: SessionUsage
}) {
  const rows = planRows(usage.plan, new Date())
  if (usage.context === null && usage.plan === null) return null
  return (
    <div className="-mb-1 flex items-center justify-between gap-3 px-1">
      {usage.plan === null ? <span /> : <PlanUsageButton sessionId={sessionId} rows={rows} />}
      {usage.context !== null && <ContextMeter context={usage.context} />}
    </div>
  )
}

/** Counts the context window down while a ring fills up with what is used. */
function ContextMeter({ context }: { readonly context: ContextUsage }) {
  const used = contextPercentUsed(context)
  const left = Math.round(100 - used)
  const detail = `${formatTokens(context.usedTokens)} of ${formatTokens(context.maxTokens)} tokens used`
  return (
    <span
      className={cn(FLOATING, "flex items-center gap-1.5", LEVEL_CLASS[usageLevel(used)])}
      title={detail}
      role="img"
      aria-label={`Context: ${left}% left, ${detail}`}
    >
      <Ring percent={used} />
      {left}% context left
    </span>
  )
}

const BAR_CLASS: Record<UsageLevel, string> = {
  ok: "bg-foreground/40",
  notice: "bg-yellow-500",
  warning: "bg-orange-500",
  critical: "bg-red-500",
}

/** `14:30` for a reset later today, `Mon 09:00` for another day. */
const formatReset = (resetsAt: string): string => {
  const date = new Date(resetsAt)
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString([], { weekday: "short" })} ${time}`
}

type Refresh =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Refreshing" }
  | { readonly _tag: "Refreshed"; readonly at: Date }
  | { readonly _tag: "Failed"; readonly error: string }

/**
 * Asks the daemon for the plan's usage right now. The new numbers arrive on
 * the session's stream; this only tracks how the last ask went.
 */
function useRefreshUsage(sessionId: SessionId) {
  const refreshUsage = useAtomSet(refreshUsageAtom, { mode: "promiseExit" })
  const [state, setState] = useState<Refresh>({ _tag: "Idle" })
  const inFlight = useRef(false)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ _tag: "Refreshing" })
    const exit = await refreshUsage({ payload: { sessionId } })
    inFlight.current = false
    setState(
      Exit.isSuccess(exit)
        ? { _tag: "Refreshed", at: new Date() }
        : { _tag: "Failed", error: describeCause(exit.cause) },
    )
  }, [refreshUsage, sessionId])
  return [state, refresh] as const
}

const refreshNote = (state: Refresh): string => {
  switch (state._tag) {
    case "Idle":
      return "As of the agent's last turn in this thread."
    case "Refreshing":
      return "Checking your plan…"
    case "Refreshed":
      return `Updated at ${state.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
    case "Failed":
      return "Could not refresh. These are the last known numbers."
  }
}

/**
 * Reads "Usage" while every window is at most half used, then names the
 * fullest one in its colour. Clicking it refreshes and lists every window of
 * the plan.
 */
function PlanUsageButton({
  sessionId,
  rows,
}: {
  readonly sessionId: SessionId
  readonly rows: ReadonlyArray<PlanRow>
}) {
  const headline = planHeadline(rows)
  const [refresh, runRefresh] = useRefreshUsage(sessionId)
  const refreshing = refresh._tag === "Refreshing"
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void runRefresh()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            FLOATING,
            "flex cursor-pointer items-center gap-1.5 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
            LEVEL_CLASS[headline === undefined ? "ok" : usageLevel(headline.utilization)],
          )}
          aria-label="Plan usage"
        >
          <Gauge className="size-3.5" aria-hidden />
          {headline === undefined
            ? "Usage"
            : `${headline.label}: ${Math.round(headline.utilization)}% used`}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 gap-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <PopoverHeader>
            <PopoverTitle>Plan usage</PopoverTitle>
            <PopoverDescription
              className={cn("text-xs", refresh._tag === "Failed" && LEVEL_CLASS.critical)}
              title={refresh._tag === "Failed" ? refresh.error : undefined}
              aria-live="polite"
            >
              {refreshNote(refresh)}
            </PopoverDescription>
          </PopoverHeader>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void runRefresh()}
            disabled={refreshing}
            aria-label="Refresh plan usage"
            title="Refresh"
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every window has reset since the last check.
          </p>
        ) : (
          rows.map((row) => <PlanRowMeter key={row.label} row={row} />)
        )}
      </PopoverContent>
    </Popover>
  )
}

function PlanRowMeter({ row }: { readonly row: PlanRow }) {
  const level = usageLevel(row.utilization)
  const used = Math.round(row.utilization)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{row.label}</span>
        <span className={cn("tabular-nums", LEVEL_CLASS[level])}>{used}% used</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={row.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={used}
      >
        <div
          className={cn("h-full rounded-full", BAR_CLASS[level])}
          style={{ width: `${Math.min(100, Math.max(0, row.utilization))}%` }}
        />
      </div>
      {row.resetsAt !== null && (
        <span className="text-xs text-muted-foreground">Resets {formatReset(row.resetsAt)}</span>
      )}
    </div>
  )
}

const RADIUS = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** A ring that fills clockwise from the top, in the colour of its text. */
function Ring({ percent }: { readonly percent: number }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <circle
        cx="8"
        cy="8"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  )
}
