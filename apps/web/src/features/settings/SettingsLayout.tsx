import { cn } from "cn"
import type { ComponentType, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/**
 * The building blocks of a settings section: a fixed header, then either one
 * scrolling pane or a list of items on the left with the chosen one's
 * settings on the right.
 */

export function SettingsFrame({
  id,
  title,
  description,
  action,
  children,
}: {
  readonly id: string
  readonly title: string
  readonly description: ReactNode
  /** A button beside the title, like "Add repository". */
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-start gap-3 border-b px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={id} className="text-base font-medium">
            {title}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SettingsPane({ children }: { readonly children: ReactNode }) {
  return <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:px-5">{children}</div>
}

export interface SettingsListItem {
  readonly id: string
  readonly label: string
  readonly icon: ReactNode
  /** Shown in the tile's top-right corner, like a status light. Give it words for screen readers. */
  readonly status?: ReactNode
}

/**
 * A section's items on the left, scrolling when there are many (a row
 * across the top on narrow screens), and the chosen item on the right.
 */
export function SettingsSplit({
  label,
  items,
  selected,
  onSelect,
  children,
}: {
  /** What the list holds, for screen readers: "Repository services". */
  readonly label: string
  readonly items: ReadonlyArray<SettingsListItem>
  readonly selected: string
  readonly onSelect: (id: string) => void
  readonly children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav aria-label={label} className="shrink-0 border-b md:w-28 md:border-r md:border-b-0">
        <ul className="flex divide-x overflow-x-auto p-2 md:h-full md:flex-col md:divide-x-0 md:divide-y md:overflow-x-visible md:overflow-y-auto">
          {items.map((item) => {
            const active = item.id === selected
            return (
              <li
                key={item.id}
                className="shrink-0 px-2 first:pl-0 last:pr-0 md:px-0 md:py-2 md:first:pt-0 md:last:pb-0"
              >
                <Button
                  variant="ghost"
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? "true" : undefined}
                  title={item.label}
                  className={cn(
                    "relative size-24 flex-col gap-2 p-2 text-xs font-normal whitespace-normal",
                    active && "bg-muted font-medium dark:bg-muted",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="line-clamp-2 w-full text-center leading-tight break-words">
                    {item.label}
                  </span>
                  {item.status !== undefined && (
                    <span className="absolute top-1.5 right-1.5 flex">{item.status}</span>
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      </nav>
      <SettingsPane>{children}</SettingsPane>
    </div>
  )
}

/** One setting: its name and what it does on the left, the control on the right. */
export function SettingsRow({
  label,
  labelId,
  detail,
  children,
}: {
  readonly label: string
  /** Lets the control name itself by the label, with `aria-labelledby`. */
  readonly labelId?: string
  readonly detail: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      {children}
    </div>
  )
}

/** A list of `SettingsRow`s, a line between each. */
export function SettingsRows({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col divide-y border-y">{children}</div>
}

/** A choice of a few options side by side, like a theme. One is always picked. */
export function SettingsChoice<Value extends string>({
  labelledBy,
  options,
  value,
  onChange,
  disabled = false,
}: {
  /** The id of the `SettingsRow` label that names the choice. */
  readonly labelledBy: string
  readonly options: ReadonlyArray<{
    readonly value: Value
    readonly label: string
    readonly icon?: ComponentType<{ readonly className?: string; readonly "aria-hidden"?: "true" }>
  }>
  readonly value: Value
  readonly onChange: (value: Value) => void
  readonly disabled?: boolean
}) {
  return (
    <ToggleGroup
      type="single"
      aria-labelledby={labelledBy}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        // Pressing the picked option again would clear it; one stays picked.
        const option = options.find((candidate) => candidate.value === next)
        if (option !== undefined) onChange(option.value)
      }}
    >
      {options.map(({ value: option, label, icon: Icon }) => (
        <ToggleGroupItem key={option} value={option}>
          {Icon !== undefined && <Icon className="size-4" aria-hidden="true" />}
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
