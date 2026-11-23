import { cn } from "cn"
import { XIcon } from "lucide-react"
import { type ComponentType, createContext, type ReactNode, useContext } from "react"
import { Button } from "@/components/ui/button"
import { DialogClose } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const DescriptionContext = createContext<ReactNode>(undefined)

export function SettingsFrame({
  id,
  title,
  description,
  action,
  children,
}: {
  readonly id: string
  readonly title: string
  readonly description?: ReactNode
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b pr-2 pl-4 md:pl-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="text-muted-foreground">Settings</span>
          <span className="text-muted-foreground" aria-hidden="true">
            /
          </span>
          <h2 id={id} className="truncate font-medium">
            {title}
          </h2>
        </div>
        {action}
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </div>
      <DescriptionContext.Provider value={description}>{children}</DescriptionContext.Provider>
    </section>
  )
}

export function SettingsPane({ children }: { readonly children: ReactNode }) {
  const description = useContext(DescriptionContext)
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <div className="flex min-w-0 flex-col">{children}</div>
      </div>
    </div>
  )
}

export function SettingsGroup({
  title,
  children,
}: {
  readonly title?: string
  readonly children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 not-first:mt-8">
      {title !== undefined && <h3 className="text-base font-semibold">{title}</h3>}
      {children}
    </section>
  )
}

export interface SettingsListItem {
  readonly id: string
  readonly label: string
  readonly icon: ReactNode
  readonly status?: ReactNode
}

export function SettingsSplit({
  label,
  items,
  selected,
  onSelect,
  children,
}: {
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

export function SettingsRow({
  label,
  labelId,
  detail,
  stacked = false,
  children,
}: {
  readonly label: string
  readonly labelId?: string
  readonly detail?: ReactNode
  readonly stacked?: boolean
  readonly children: ReactNode
}) {
  return (
    <div
      data-setting={label}
      className={cn(
        "flex scroll-my-6 gap-3 py-4 transition-colors duration-500 data-highlight:bg-muted/70",
        stacked ? "flex-col" : "flex-wrap items-center justify-between",
      )}
    >
      <div className={cn("flex min-w-0 flex-col gap-0.5", !stacked && "flex-1 basis-64")}>
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        {detail !== undefined && <span className="text-xs text-muted-foreground">{detail}</span>}
      </div>
      {children}
    </div>
  )
}

export function SettingsRows({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col divide-y border-y">{children}</div>
}

export function SettingsChoice<Value extends string>({
  labelledBy,
  options,
  value,
  onChange,
  disabled = false,
}: {
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
