import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type AgentProvider,
  PROVIDER_NAMES,
  totalTokens,
  type UsageAmount,
  type UsageReport,
} from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { projectsAtom } from "@/features/projects/atoms"
import { allSessionsAtom, usageReportAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import {
  dailySeries,
  formatCost,
  formatCount,
  planSeries,
  providersIn,
  rangeOf,
  shareOf,
  USAGE_RANGES,
  type UsageRangeId,
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

const shortDay = (day: unknown) => {
  const parsed = new Date(`${String(day)}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? String(day)
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export default function UsagePage() {
  const load = useAtomSet(usageReportAtom, { mode: "promiseExit" })
  const [rangeId, setRangeId] = useState<UsageRangeId>("week")
  const range = useMemo(() => rangeOf(rangeId, new Date()), [rangeId])
  const [loaded, setLoaded] = useState<{
    readonly rangeId: UsageRangeId
    readonly report?: UsageReport
    readonly error?: string
  }>()

  useEffect(() => {
    let current = true
    void load({
      payload: {
        from: range.from,
        to: range.to,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      },
    }).then((exit) => {
      if (!current) return
      setLoaded(
        Exit.isSuccess(exit)
          ? { rangeId, report: exit.value }
          : { rangeId, error: describeCause(exit.cause) },
      )
    })
    return () => {
      current = false
    }
  }, [load, range, rangeId])

  const shown = loaded?.rangeId === rangeId ? loaded : undefined

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tokens and cost of every turn of every thread. Cost is what Claude Code reports; other
          providers report tokens only.
        </p>
        <ToggleGroup
          type="single"
          value={rangeId}
          onValueChange={(value) => {
            if (value !== "") setRangeId(value as UsageRangeId)
          }}
        >
          {USAGE_RANGES.map((each) => (
            <ToggleGroupItem key={each.id} value={each.id}>
              {each.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {shown === undefined ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner /> Adding up the turns…
        </div>
      ) : shown.error !== undefined || shown.report === undefined ? (
        <p className="text-sm text-destructive">{shown.error ?? "The report did not load."}</p>
      ) : (
        <Report report={shown.report} days={range.days} />
      )}
    </div>
  )
}

function Report({
  report,
  days,
}: {
  readonly report: UsageReport
  readonly days: ReadonlyArray<string>
}) {
  const daily = useMemo(() => dailySeries(report, days), [report, days])
  const providers = providersIn(report)
  const plans = planSeries(report)
  const total = totalTokens(report.totals)

  if (report.totals.turns === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">No turns in this range yet.</p>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tokens" value={formatCount(total)} />
        <Stat
          label="Output tokens"
          value={formatCount(report.totals.outputTokens)}
          hint={`${formatCount(report.totals.inputTokens)} in, ${formatCount(report.totals.cacheReadTokens)} read from cache`}
        />
        <Stat label="Turns" value={String(report.totals.turns)} />
        <Stat
          label="Cost"
          value={formatCost(report.totals) ?? "—"}
          hint={report.totals.costUsd === null ? "No provider reported one" : "Claude Code only"}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Tokens per day</h3>
        <ChartContainer config={providerConfig} className="aspect-auto h-56">
          <BarChart data={[...daily]} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickFormatter={shortDay}
              minTickGap={16}
            />
            <YAxis tickLine={false} axisLine={false} tickFormatter={formatCount} width={44} />
            <ChartTooltip
              content={<ChartTooltipContent formatValue={formatCount} formatLabel={shortDay} />}
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
        <ChartLegend config={providerConfig} keys={providers} />
      </section>

      {plans.length > 0 && <PlanChart plans={plans} />}

      <div className="grid gap-6 md:grid-cols-3">
        <TopList
          title="Providers and models"
          rows={report.byModel.map((row) => ({
            key: `${row.provider}:${row.model ?? ""}`,
            label: `${PROVIDER_NAMES[row.provider]} · ${row.model ?? "default model"}`,
            amount: row.amount,
            color: PROVIDER_COLOR[row.provider],
          }))}
          total={total}
        />
        <ProjectsList report={report} total={total} />
        <ThreadsList report={report} total={total} />
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly hint?: string | undefined
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

function PlanChart({ plans }: { readonly plans: ReturnType<typeof planSeries> }) {
  const config: ChartConfig = Object.fromEntries(
    plans.map((plan) => [
      plan.key.replace(/[^a-zA-Z0-9-]/g, "_"),
      {
        label: `${PROVIDER_NAMES[plan.provider]}${plan.accountKey === "" ? "" : ` (${plan.accountKey.slice(0, 8)})`}`,
        color: PROVIDER_COLOR[plan.provider],
      },
    ]),
  )
  const keys = Object.keys(config)
  const dashed = new Set(
    plans.flatMap((plan, index) =>
      plans.slice(0, index).some((earlier) => earlier.provider === plan.provider)
        ? [keys[index] ?? ""]
        : [],
    ),
  )
  const rows = plans
    .flatMap((plan, index) =>
      plan.points.map((point) => ({ at: point.at, [keys[index] ?? ""]: point.utilization })),
    )
    .sort((a, b) => a.at - b.at)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Five-hour plan limit, as Humanity read it</h3>
      <ChartContainer config={config} className="aspect-auto h-44">
        <LineChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(at: number) =>
              new Date(at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
              })
            }
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}%`}
            width={40}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatValue={(value) => `${Math.round(value)}%`}
                formatLabel={(at) => new Date(Number(at)).toLocaleString()}
              />
            }
          />
          {keys.map((key) => (
            <Line
              key={key}
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              {...(dashed.has(key) ? { strokeDasharray: "5 4" } : {})}
              dot={false}
              connectNulls
              type="monotone"
            />
          ))}
        </LineChart>
      </ChartContainer>
      <ChartLegend config={config} keys={keys} />
    </section>
  )
}

interface TopRow {
  readonly key: string
  readonly label: string
  readonly amount: UsageAmount
  readonly color?: string | undefined
}

function TopList({
  title,
  rows,
  total,
}: {
  readonly title: string
  readonly rows: ReadonlyArray<TopRow>
  readonly total: number
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const tokens = totalTokens(row.amount)
            const cost = formatCost(row.amount)
            return (
              <li key={row.key} className="flex flex-col gap-1 text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate" title={row.label}>
                    {row.label}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{formatCount(tokens)}</span>
                  {cost !== undefined && (
                    <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                      {cost}
                    </span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-2"
                    style={{
                      width: `${shareOf(tokens, total) * 100}%`,
                      ...(row.color === undefined ? {} : { background: row.color }),
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ProjectsList({ report, total }: { readonly report: UsageReport; readonly total: number }) {
  const projects = useAtomValue(projectsAtom)
  const names = new Map(
    AsyncResult.isSuccess(projects)
      ? projects.value.map((project) => [project.id as string, project.name] as const)
      : [],
  )
  return (
    <TopList
      title="Projects"
      total={total}
      rows={report.byProject.map((row) => ({
        key: row.projectId,
        label: names.get(row.projectId) ?? "A removed project",
        amount: row.amount,
      }))}
    />
  )
}

function ThreadsList({ report, total }: { readonly report: UsageReport; readonly total: number }) {
  const sessions = useAtomValue(allSessionsAtom)
  const titles = new Map(
    AsyncResult.isSuccess(sessions)
      ? sessions.value.map((session) => [session.id as string, session.title] as const)
      : [],
  )
  return (
    <TopList
      title="Threads"
      total={total}
      rows={report.bySession.map((row) => ({
        key: row.sessionId,
        label: titles.get(row.sessionId) ?? "A removed thread",
        amount: row.amount,
      }))}
    />
  )
}
