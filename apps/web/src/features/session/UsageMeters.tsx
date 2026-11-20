import { useAtomSet } from "@effect/atom-react"
import {
  type AccountUsage,
  type AgentProvider,
  type ContextUsage,
  PROVIDER_NAMES,
  type SessionId,
  type SessionUsage,
} from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { ChevronDown, RefreshCw } from "lucide-react"
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ProviderIcon } from "@/features/providers/ProviderIcon"
import { useProviderAccounts } from "@/features/providers/useProviderModels"
import { describeCause } from "@/lib/errors"
import { otherAccountsUsageAtom, refreshUsageAtom } from "./atoms.ts"
import {
  accountLabel,
  type CompactWindow,
  compactWindows,
  contextPercentUsed,
  formatTokens,
  OTHER_ACCOUNTS_SHOWN,
  otherAccountRows,
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

const FLOATING = "rounded-full bg-background/60 px-2 py-0.5 text-xs tabular-nums backdrop-blur-sm"

export const UsageMeters = memo(function UsageMeters({
  sessionId,
  provider,
  accountId,
  usage,
  hint,
}: {
  readonly sessionId: SessionId
  readonly provider: AgentProvider
  readonly accountId: string
  readonly usage: SessionUsage
  /** Shown to the right of the plan usage: the chat box's key hint. */
  readonly hint?: ReactNode
}) {
  const rows = planRows(usage.plan, new Date())
  if (usage.context === null && usage.plan === null && hint === undefined) return null
  return (
    <div className="-mb-1 flex items-center gap-3 px-1">
      <div className="flex min-w-0 items-center gap-2">
        {usage.plan !== null && (
          <PlanUsageButton
            sessionId={sessionId}
            provider={provider}
            accountId={accountId}
            rows={rows}
          />
        )}
        {hint}
      </div>
      {usage.context !== null && (
        <span className="ml-auto shrink-0">
          <ContextMeter context={usage.context} />
        </span>
      )}
    </div>
  )
})

/**
 * The chat box's key hint, floating like the meters beside it. It stays in place and only fades,
 * so its row never appears or grows under the chat.
 */
export const HINT_CLASS = cn(FLOATING, "hidden min-w-0 sm:flex")

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

const formatReset = (resetsAt: string): string => {
  const date = new Date(resetsAt)
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString([], { weekday: "short" })} ${time}`
}

type Refresh =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Refreshing"; readonly last: Date | undefined }
  | { readonly _tag: "Refreshed"; readonly at: Date }
  | { readonly _tag: "Failed"; readonly error: string }

function useRefreshUsage(sessionId: SessionId) {
  const refreshUsage = useAtomSet(refreshUsageAtom, { mode: "promiseExit" })
  const [state, setState] = useState<Refresh>({ _tag: "Idle" })
  const inFlight = useRef(false)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setState((previous) => ({
      _tag: "Refreshing",
      last: previous._tag === "Refreshed" ? previous.at : undefined,
    }))
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

type Others =
  | { readonly _tag: "Loading"; readonly accounts: ReadonlyArray<AccountUsage> | undefined }
  | { readonly _tag: "Loaded"; readonly accounts: ReadonlyArray<AccountUsage> }
  | { readonly _tag: "Failed"; readonly error: string }

function useOtherAccounts(sessionId: SessionId) {
  const read = useAtomSet(otherAccountsUsageAtom, { mode: "promiseExit" })
  const [state, setState] = useState<Others>({ _tag: "Loading", accounts: undefined })
  const load = useCallback(
    async (refresh: boolean) => {
      setState((previous) => ({
        _tag: "Loading",
        accounts: previous._tag === "Failed" ? undefined : previous.accounts,
      }))
      const exit = await read({ payload: { sessionId, refresh } })
      setState(
        Exit.isSuccess(exit)
          ? { _tag: "Loaded", accounts: exit.value }
          : { _tag: "Failed", error: describeCause(exit.cause) },
      )
    },
    [read, sessionId],
  )
  return [state, load] as const
}

function RefreshNote({ state }: { readonly state: Refresh }) {
  if (state._tag === "Failed") {
    return (
      <span className={cn("text-xs", LEVEL_CLASS.critical)} title={state.error} aria-live="polite">
        Could not refresh
      </span>
    )
  }
  const at =
    state._tag === "Refreshed" ? state.at : state._tag === "Refreshing" ? state.last : undefined
  return (
    <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
      {at === undefined
        ? ""
        : `Updated ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
    </span>
  )
}

function PlanUsageButton({
  sessionId,
  provider,
  accountId,
  rows,
}: {
  readonly sessionId: SessionId
  readonly provider: AgentProvider
  readonly accountId: string
  readonly rows: ReadonlyArray<PlanRow>
}) {
  const headline = planHeadline(rows)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            FLOATING,
            "flex cursor-pointer items-center gap-1.5 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
            LEVEL_CLASS[headline === undefined ? "ok" : usageLevel(headline.utilization)],
          )}
          aria-label={`Plan usage of ${PROVIDER_NAMES[provider]}`}
        >
          <ProviderIcon provider={provider} className="size-3.5" />
          {headline === undefined
            ? "Usage"
            : `${headline.label}: ${Math.round(headline.utilization)}% used`}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-84 gap-3 p-3">
        <PlanUsagePanel
          sessionId={sessionId}
          provider={provider}
          accountId={accountId}
          rows={rows}
        />
      </PopoverContent>
    </Popover>
  )
}

function PlanUsagePanel({
  sessionId,
  provider,
  accountId,
  rows,
}: {
  readonly sessionId: SessionId
  readonly provider: AgentProvider
  readonly accountId: string
  readonly rows: ReadonlyArray<PlanRow>
}) {
  const [refresh, runRefresh] = useRefreshUsage(sessionId)
  const [others, loadOthers] = useOtherAccounts(sessionId)
  const refreshAll = useCallback(
    (again: boolean) => {
      void runRefresh()
      void loadOthers(again)
    },
    [runRefresh, loadOthers],
  )
  useEffect(() => refreshAll(false), [refreshAll])

  const ownAccounts = useProviderAccounts()[provider].filter((account) => account.connected)
  const ownName = ownAccounts.find((account) => account.id === accountId)?.name
  const refreshing = refresh._tag === "Refreshing" || others._tag === "Loading"

  return (
    <>
      <div className="flex items-center gap-2">
        <PopoverHeader className="grow">
          <PopoverTitle>Plan usage</PopoverTitle>
        </PopoverHeader>
        <RefreshNote state={refresh} />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => refreshAll(true)}
          disabled={refreshing}
          aria-label="Refresh plan usage"
          title="Refresh"
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
        </Button>
      </div>
      <section className="flex flex-col gap-2.5" aria-label="This thread's account">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <ProviderIcon provider={provider} className="size-3.5" />
          <span className="truncate font-medium">
            {accountLabel(provider, ownName, ownAccounts.length)}
          </span>
          <Badge variant="secondary" className="ml-auto shrink-0">
            This thread
          </Badge>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every window has reset since the last check.
          </p>
        ) : (
          rows.map((row) => <PlanRowMeter key={row.label} row={row} />)
        )}
      </section>
      <OtherAccounts state={others} />
    </>
  )
}

function PlanRowMeter({ row }: { readonly row: PlanRow }) {
  const level = usageLevel(row.utilization)
  const used = Math.round(row.utilization)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{row.label}</span>
        <span className="tabular-nums">
          <span className={LEVEL_CLASS[level]}>{used}% used</span>
          {row.resetsAt !== null && (
            <span className="text-muted-foreground"> · resets {formatReset(row.resetsAt)}</span>
          )}
        </span>
      </div>
      <Progress
        value={Math.min(100, Math.max(0, row.utilization))}
        aria-label={row.label}
        className="h-1.5"
        indicatorClassName={cn("rounded-full", BAR_CLASS[level])}
      />
    </div>
  )
}

type OtherAccountRowData = ReturnType<typeof otherAccountRows>[number]

function OtherAccounts({ state }: { readonly state: Others }) {
  const [expanded, setExpanded] = useState(false)
  if (state._tag === "Failed") {
    return (
      <p className="border-t pt-2.5 text-xs text-muted-foreground" title={state.error}>
        Could not read your other accounts.
      </p>
    )
  }
  if (state.accounts === undefined) {
    return (
      <p className="border-t pt-2.5 text-xs text-muted-foreground">Checking your other accounts…</p>
    )
  }
  const accounts = otherAccountRows(state.accounts)
  if (accounts.length === 0) return null
  const hidden = accounts.length - OTHER_ACCOUNTS_SHOWN
  const list = (shown: ReadonlyArray<OtherAccountRowData>) =>
    shown.map((account) => (
      <OtherAccountRow key={`${account.provider}/${account.accountId}`} account={account} />
    ))
  return (
    <section className="flex flex-col border-t pt-2.5" aria-label="Other accounts">
      <span className="pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Other accounts
      </span>
      {expanded ? (
        <div className="max-h-44 scrollbar-thin overflow-y-auto overscroll-contain">
          {list(accounts)}
        </div>
      ) : (
        list(accounts.slice(0, OTHER_ACCOUNTS_SHOWN))
      )}
      {!expanded && hidden > 0 && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1 text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
          <ChevronDown data-icon="inline-end" aria-hidden />
        </Button>
      )}
    </section>
  )
}

function OtherAccountRow({ account }: { readonly account: OtherAccountRowData }) {
  const { plan } = account
  const windows = plan === null ? [] : compactWindows(plan, new Date())
  return (
    <div className="flex min-w-0 items-center gap-2 border-b py-2 text-xs last:border-b-0">
      <ProviderIcon provider={account.provider} className="size-3.5" />
      <span className="grow truncate font-medium">{account.label}</span>
      {plan === null ? (
        <span className="shrink-0 text-muted-foreground" title={account.unavailable ?? undefined}>
          {account.unavailable === null ? "Limits not available" : "Could not read its limits"}
        </span>
      ) : windows.length === 0 ? (
        <span className="shrink-0 text-muted-foreground">No limits to show</span>
      ) : (
        windows.map((window) => <MiniMeter key={window.label} window={window} />)
      )}
    </div>
  )
}

function MiniMeter({ window }: { readonly window: CompactWindow }) {
  const level = usageLevel(window.used)
  const percent = Math.round(window.used)
  const resets =
    window.resetsAt !== null && window.used > 0 ? `, resets ${formatReset(window.resetsAt)}` : ""
  const description = `${window.label}: ${percent}% used${resets}`
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1.5 tabular-nums", LEVEL_CLASS[level])}
      role="img"
      aria-label={description}
      title={description}
    >
      <span className="max-w-12 truncate text-muted-foreground" aria-hidden>
        {window.short}
      </span>
      <span className="flex h-1 w-8 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn("rounded-full", BAR_CLASS[level])}
          style={{ width: `${Math.min(100, Math.max(0, window.used))}%` }}
        />
      </span>
      <span className="w-8 text-right" aria-hidden>
        {percent}%
      </span>
    </span>
  )
}

const RADIUS = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

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
