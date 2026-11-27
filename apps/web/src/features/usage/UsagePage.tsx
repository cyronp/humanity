import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type AgentProvider,
  DEFAULT_ACCOUNT,
  PROVIDER_NAMES,
  totalTokens,
  type UsageAmount,
  type UsageReport,
} from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "cn"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { RefreshCw } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { projectsAtom } from "@/features/projects/atoms"
import { modelDisplayName } from "@/features/providers/models"
import { ProviderIcon } from "@/features/providers/ProviderIcon"
import { useProviderAccounts } from "@/features/providers/useProviderModels"
import { allSessionsAtom, usageReportAtom } from "@/features/session/atoms"
import { accountLabel, type UsageLevel, usageLevel } from "@/features/session/usage"
import { describeCause } from "@/lib/errors"
import { IconButton } from "@/components/IconButton"
import {
  cacheHitRate,
  closeUsage,
  formatAgo,
  formatCost,
  formatCount,
  formatShare,
  formatSpan,
  type LimitAccount,
  type LimitWindow,
  limitAccounts,
  type MixSegment,
  providersIn,
  rangeOf,
  shareOf,
  storedRange,
  storeRange,
  tokenMix,
  tokenSeries,
  USAGE_RANGES,
  type UsageRange,
  type UsageRangeId,
  WINDOW_LABEL,
} from "./usage.ts"

const PROVIDER_COLOR: Record<AgentProvider, string> = {
  "claude-code": "#D97757",
  codex: "var(--foreground)",
  kiro: "#9046FF",
  antigravity: "#3186FF",
}

const providerConfig: ChartConfig = Object.fromEntries(
  (Object.keys(PROVIDER_COLOR) as Array<AgentProvider>).map((provider) => [
    provider,
    { label: PROVIDER_NAMES[provider], color: PROVIDER_COLOR[provider] },
  ]),
)

const MIX_COLOR: Record<MixSegment["id"], string> = {
  cacheRead: "color-mix(in oklab, var(--foreground) 22%, var(--background))",
  input: "color-mix(in oklab, var(--foreground) 45%, var(--background))",
  cacheWrite: "color-mix(in oklab, var(--foreground) 65%, var(--background))",
  output: "var(--foreground)",
}

const LIMIT_FILL: Record<UsageLevel, string> = {
  ok: "bg-foreground/45",
  notice: "bg-yellow-500",
  warning: "bg-orange-500",
  critical: "bg-red-500",
}

const bucketLabel = (bucket: unknown): string => {
  const text = String(bucket)
  const hour = /T(\d{2})$/.exec(text)
  if (hour !== null) return `${hour[1]}:00`
  const parsed = new Date(`${text}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? text
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

type Loaded =
  | {
      readonly request: string
      readonly range: UsageRange
      readonly report: UsageReport
      readonly at: number
    }
  | { readonly request: string; readonly error: string }

export default function UsagePage() {
  const load = useAtomSet(usageReportAtom, { mode: "promiseExit" })
  const [rangeId, setRangeId] = useState<UsageRangeId>(storedRange)
  const [reloads, setReloads] = useState(0)
  const [loaded, setLoaded] = useState<Loaded>()
  const request = `${rangeId}:${reloads}`

  useEffect(() => {
    let current = true
    const range = rangeOf(rangeId, new Date())
    void load({
      payload: {
        from: range.from,
        to: range.to,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        hourly: range.hourly,
      },
    }).then((exit) => {
      if (!current) return
      setLoaded(
        Exit.isSuccess(exit)
          ? { request, range, report: exit.value, at: Date.now() }
          : { request, error: describeCause(exit.cause) },
      )
    })
    return () => {
      current = false
    }
  }, [load, rangeId, request])

  const pick = (value: string) => {
    const next = USAGE_RANGES.find((each) => each.id === value)?.id
    if (next === undefined) return
    setRangeId(next)
    storeRange(next)
  }

  const loading = loaded?.request !== request

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup type="single" value={rangeId} onValueChange={pick}>
          {USAGE_RANGES.map((each) => (
            <ToggleGroupItem key={each.id} value={each.id}>
              {each.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <IconButton
          variant="ghost"
          size="icon-sm"
          label="Refresh usage"
          disabled={loading}
          onClick={() => setReloads((count) => count + 1)}
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
        </IconButton>
      </div>
      {loaded === undefined ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner /> Adding up the turns…
        </div>
      ) : "error" in loaded ? (
        <p className="text-sm text-destructive">{loaded.error}</p>
      ) : (
        <div
          aria-busy={loading}
          className={cn(
            "flex flex-col gap-8 transition-opacity",
            loading && "opacity-50 delay-150",
          )}
        >
          <Report
            report={loaded.report}
            range={loaded.range}
            limits={<Limits report={loaded.report} now={loaded.at} />}
          />
        </div>
      )}
    </div>
  )
}

function Report({
  report,
  range,
  limits,
}: {
  readonly report: UsageReport
  readonly range: UsageRange
  readonly limits: ReactNode
}) {
  const series = useMemo(() => tokenSeries(report, range), [report, range])
  const providers = providersIn(report)
  const total = totalTokens(report.totals)
  const cost = formatCost(report.totals)
  const costOnlyClaude = cost !== undefined && providers.some((each) => each !== "claude-code")

  if (report.totals.turns === 0) {
    return (
      <>
        <p className="py-10 text-center text-sm text-muted-foreground">
          No turns in this range yet.
        </p>
        {limits}
      </>
    )
  }

  return (
    <>
      <section className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatCount(total)}
            </span>
            <span className="text-sm text-muted-foreground">
              tokens in {report.totals.turns} {report.totals.turns === 1 ? "turn" : "turns"}
            </span>
            {cost !== undefined && (
              <span className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{cost}</span>
                {costOnlyClaude ? " reported by Claude Code" : " reported"}
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-2.5">
            {report.byProvider
              .filter((row) => row.amount.turns > 0)
              .map((row) => {
                const tokens = totalTokens(row.amount)
                const rowCost = formatCost(row.amount)
                return (
                  <li key={row.provider} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: PROVIDER_COLOR[row.provider] }}
                    />
                    <ProviderIcon provider={row.provider} className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{PROVIDER_NAMES[row.provider]}</span>
                    <span className="flex flex-col items-end leading-tight">
                      <span className="font-medium tabular-nums">{formatCount(tokens)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatShare(tokens, total)}
                        {rowCost !== undefined && ` · ${rowCost}`}
                      </span>
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-sm font-medium">
            {range.hourly ? "Tokens per hour" : "Tokens per day"}
          </h3>
          <ChartContainer config={providerConfig} className="aspect-auto h-52">
            <BarChart data={[...series]} margin={{ left: 0, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={false}
                tickFormatter={bucketLabel}
                minTickGap={20}
              />
              <YAxis tickLine={false} axisLine={false} tickFormatter={formatCount} width={40} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatValue={formatCount}
                    formatLabel={bucketLabel}
                    showTotal
                  />
                }
              />
              {providers.map((provider, index) => (
                <Bar
                  key={provider}
                  dataKey={provider}
                  stackId="tokens"
                  fill={`var(--color-${provider})`}
                  radius={index === providers.length - 1 ? [3, 3, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      </section>

      {limits}

      <TokenMix amount={report.totals} />

      <Breakdown report={report} total={total} />
    </>
  )
}

function TokenMix({ amount }: { readonly amount: UsageAmount }) {
  const segments = tokenMix(amount)
  const total = totalTokens(amount)
  const hit = cacheHitRate(amount)
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Where the tokens went</h3>
        {hit !== undefined && (
          <span
            className="text-xs text-muted-foreground"
            title="Share of the prompt read from the cache instead of sent again"
          >
            {Math.round(hit * 100)}% of the prompt came from the cache
          </span>
        )}
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {segments.map((segment) =>
          segment.tokens <= 0 ? null : (
            <div
              key={segment.id}
              className="h-full"
              title={`${segment.label}: ${formatCount(segment.tokens)}`}
              style={{
                width: `${shareOf(segment.tokens, total) * 100}%`,
                background: MIX_COLOR[segment.id],
              }}
            />
          ),
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.id} className="flex items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: MIX_COLOR[segment.id] }}
            />
            <dt className="text-muted-foreground">{segment.label}</dt>
            <dd className="ml-auto font-medium tabular-nums sm:ml-1">
              {formatCount(segment.tokens)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

type BreakdownView = "models" | "projects" | "threads"

interface BreakdownRow {
  readonly key: string
  readonly label: string
  readonly detail?: string | undefined
  readonly provider?: AgentProvider | undefined
  readonly amount: UsageAmount
  readonly open?: (() => void) | undefined
}

function Breakdown({ report, total }: { readonly report: UsageReport; readonly total: number }) {
  const [view, setView] = useState<BreakdownView>("models")
  const navigate = useNavigate()
  const accounts = useProviderAccounts()
  const projects = useAtomValue(projectsAtom)
  const sessions = useAtomValue(allSessionsAtom)

  const projectNames = useMemo(
    () =>
      new Map(
        AsyncResult.isSuccess(projects)
          ? projects.value.map((project) => [project.id as string, project.name] as const)
          : [],
      ),
    [projects],
  )
  const threads = useMemo(
    () =>
      new Map(
        AsyncResult.isSuccess(sessions)
          ? sessions.value.map((session) => [session.id as string, session] as const)
          : [],
      ),
    [sessions],
  )

  const openThread = useCallback(
    (projectId: string, sessionId: string) => {
      closeUsage()
      void navigate({
        to: "/projects/$projectId/sessions/$sessionId",
        params: { projectId, sessionId },
      })
    },
    [navigate],
  )

  const rows: ReadonlyArray<BreakdownRow> =
    view === "models"
      ? report.byModel.map((row) => ({
          key: `${row.provider}:${row.model ?? ""}`,
          label: modelDisplayName(
            accounts[row.provider].flatMap((account) => account.models),
            row.model,
          ),
          detail: PROVIDER_NAMES[row.provider],
          provider: row.provider,
          amount: row.amount,
        }))
      : view === "projects"
        ? report.byProject.map((row) => ({
            key: row.projectId,
            label: projectNames.get(row.projectId) ?? "A removed project",
            amount: row.amount,
          }))
        : report.bySession.map((row) => {
            const thread = threads.get(row.sessionId)
            return {
              key: row.sessionId,
              label: thread?.title ?? "A removed thread",
              detail: projectNames.get(row.projectId),
              provider: thread?.provider,
              amount: row.amount,
              open:
                thread === undefined ? undefined : () => openThread(row.projectId, row.sessionId),
            }
          })

  const peak = Math.max(0, ...rows.map((row) => totalTokens(row.amount)))
  const withCost = rows.some((row) => row.amount.costUsd !== null)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Top {view}</h3>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value === "models" || value === "projects" || value === "threads") setView(value)
          }}
        >
          <ToggleGroupItem value="models" size="sm">
            Models
          </ToggleGroupItem>
          <ToggleGroupItem value="projects" size="sm">
            Projects
          </ToggleGroupItem>
          <ToggleGroupItem value="threads" size="sm">
            Threads
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">Nothing in this range.</p>
      ) : (
        <div className="flex flex-col text-sm">
          <div
            className={cn(
              "grid items-center gap-3 border-b pb-1.5 text-xs text-muted-foreground",
              withCost
                ? "grid-cols-[minmax(0,1fr)_3.5rem_4rem_3rem_4rem]"
                : "grid-cols-[minmax(0,1fr)_3.5rem_4rem_3rem]",
            )}
          >
            <span>Name</span>
            <span className="text-right">Turns</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Share</span>
            {withCost && <span className="text-right">Cost</span>}
          </div>
          {rows.map((row) => (
            <BreakdownLine key={row.key} row={row} peak={peak} total={total} withCost={withCost} />
          ))}
        </div>
      )}
    </section>
  )
}

function BreakdownLine({
  row,
  peak,
  total,
  withCost,
}: {
  readonly row: BreakdownRow
  readonly peak: number
  readonly total: number
  readonly withCost: boolean
}) {
  const tokens = totalTokens(row.amount)
  const className = cn(
    "grid w-full items-center gap-3 border-b py-2 text-left last:border-b-0",
    withCost
      ? "grid-cols-[minmax(0,1fr)_3.5rem_4rem_3rem_4rem]"
      : "grid-cols-[minmax(0,1fr)_3.5rem_4rem_3rem]",
    row.open !== undefined && "cursor-pointer rounded-sm hover:bg-muted/50",
  )
  const content = (
    <>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {row.provider !== undefined && (
            <ProviderIcon provider={row.provider} className="size-3.5 shrink-0" />
          )}
          <span className="truncate" title={row.label}>
            {row.label}
          </span>
          {row.detail !== undefined && (
            <span className="shrink-0 truncate text-xs text-muted-foreground">{row.detail}</span>
          )}
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-foreground/40"
            style={{
              width: `max(0.25rem, ${shareOf(tokens, peak) * 100}%)`,
              ...(row.provider === undefined ? {} : { background: PROVIDER_COLOR[row.provider] }),
            }}
          />
        </span>
      </span>
      <span className="text-right text-muted-foreground tabular-nums">{row.amount.turns}</span>
      <span className="text-right font-medium tabular-nums">{formatCount(tokens)}</span>
      <span className="text-right text-muted-foreground tabular-nums">
        {formatShare(tokens, total)}
      </span>
      {withCost && (
        <span className="text-right text-muted-foreground tabular-nums">
          {formatCost(row.amount) ?? "—"}
        </span>
      )}
    </>
  )
  return row.open === undefined ? (
    <div className={className}>{content}</div>
  ) : (
    <button type="button" className={className} onClick={row.open} title="Open the thread">
      {content}
    </button>
  )
}

function Limits({ report, now }: { readonly report: UsageReport; readonly now: number }) {
  const accounts = useProviderAccounts()
  const rows = useMemo(() => limitAccounts(report.limits, now), [report.limits, now])
  if (rows.length === 0) return null
  const nameOf = (row: LimitAccount): string => {
    const listed = accounts[row.provider]
    const id = row.accountKey === "" ? DEFAULT_ACCOUNT : row.accountKey
    const account = listed.find((each) => each.id === id)
    return account === undefined && row.accountKey !== ""
      ? `${PROVIDER_NAMES[row.provider]} · a removed account`
      : accountLabel(row.provider, account?.name, listed.length)
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Plan limits</h3>
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <ProviderIcon provider={row.provider} className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{nameOf(row)}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                read {formatAgo(row.readAt, now)}
              </span>
            </div>
            {row.windows.map((window) => (
              <LimitBar key={window.window} window={window} now={now} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function LimitBar({ window, now }: { readonly window: LimitWindow; readonly now: number }) {
  const used = Math.round(window.used)
  const ahead = window.elapsed !== undefined && window.used / 100 > window.elapsed + 0.05
  const resets = window.resetSince
    ? "reset since"
    : window.resetsAt === undefined
      ? ""
      : `resets in ${formatSpan(window.resetsAt - now)}`
  const label = `${WINDOW_LABEL[window.window]} limit: ${used}% used${
    window.elapsed === undefined ? "" : `, ${Math.round(window.elapsed * 100)}% of the window gone`
  }${resets === "" ? "" : `, ${resets}`}`
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs sm:grid-cols-[3.5rem_minmax(0,1fr)_9rem]">
      <span className="text-muted-foreground">{WINDOW_LABEL[window.window]}</span>
      <div
        role="img"
        aria-label={label}
        title={
          window.resetsAt === undefined
            ? label
            : `${label}\nResets ${new Date(window.resetsAt).toLocaleString(undefined, {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
        }
        className="relative h-2.5 overflow-visible rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", LIMIT_FILL[usageLevel(window.used)])}
          style={{ width: `${window.used}%` }}
        />
        {window.elapsed !== undefined && (
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/70"
            style={{ left: `calc(${window.elapsed * 100}% - 1px)` }}
          />
        )}
      </div>
      <span className="flex items-baseline justify-end gap-1.5 tabular-nums">
        <span className={cn("font-medium", ahead && "text-orange-600 dark:text-orange-400")}>
          {used}%
        </span>
        <span className="truncate text-muted-foreground">{resets}</span>
      </span>
    </div>
  )
}
