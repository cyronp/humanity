import { cn } from "cn"
import * as React from "react"
import { ResponsiveContainer, Tooltip } from "recharts"

export type ChartConfig = Record<string, { readonly label: string; readonly color: string }>

const ChartContext = React.createContext<ChartConfig>({})

const useChart = () => React.useContext(ChartContext)

function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  readonly config: ChartConfig
  readonly children: React.ReactElement
}) {
  const style = Object.fromEntries(
    Object.entries(config).map(([key, entry]) => [`--color-${key}`, entry.color]),
  ) as React.CSSProperties
  return (
    <ChartContext value={config}>
      <div
        data-slot="chart"
        className={cn(
          "aspect-video w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60 [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60 [&_.recharts-surface]:outline-hidden",
          className,
        )}
        style={{ ...style, ...props.style }}
        {...props}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext>
  )
}

const ChartTooltip = Tooltip

interface TooltipEntry {
  readonly dataKey?: string | number | ((value: unknown) => unknown)
  readonly name?: string | number
  readonly value?: unknown
  readonly color?: string
}

function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue = (value) => String(value),
  formatLabel = (value) => String(value),
}: {
  readonly active?: boolean
  readonly payload?: ReadonlyArray<TooltipEntry>
  readonly label?: unknown
  readonly formatValue?: (value: number) => string
  readonly formatLabel?: (label: unknown) => string
}) {
  const config = useChart()
  if (active !== true || payload === undefined || payload.length === 0) return null
  const rows = payload.filter((entry) => typeof entry.value === "number" && entry.value > 0)
  if (rows.length === 0) return null
  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatLabel(label)}</div>
      {rows.map((entry) => {
        const key = String(entry.dataKey ?? entry.name ?? "")
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: config[key]?.color ?? entry.color }}
            />
            <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
            <span className="ml-auto font-mono font-medium tabular-nums">
              {formatValue(entry.value as number)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChartLegend({
  config,
  keys,
}: {
  readonly config: ChartConfig
  readonly keys: ReadonlyArray<string>
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs">
      {keys.map((key) => (
        <div key={key} className="flex items-center gap-1.5">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ background: config[key]?.color }}
          />
          <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
        </div>
      ))}
    </div>
  )
}

export { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent }
