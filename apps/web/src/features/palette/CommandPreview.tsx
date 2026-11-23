import { Check, ChevronRight, CornerDownLeft, Filter } from "lucide-react"
import type { ReactNode } from "react"
import { Kbd } from "@/components/ui/kbd"
import type { FilterSuggestion } from "./filters.ts"
import type { PaletteCommand } from "./registry.ts"

export function CommandPreview({ command }: { readonly command: PaletteCommand }) {
  const choices = command.page?.items?.length
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">{command.group}</span>
        <span className="text-sm font-medium wrap-anywhere">{command.title}</span>
        {command.detail !== undefined && (
          <span className="text-muted-foreground wrap-anywhere">{command.detail}</span>
        )}
      </div>
      <dl className="flex flex-col gap-2">
        {command.checked === true && (
          <Line icon={<Check className="size-3.5" />}>The current choice</Line>
        )}
        {command.page !== undefined ? (
          <Line icon={<ChevronRight className="size-3.5" />}>
            {choices === undefined
              ? "Opens a list to choose from"
              : `Opens ${choices} ${choices === 1 ? "choice" : "choices"}`}
          </Line>
        ) : (
          <Line icon={<CornerDownLeft className="size-3.5" />}>Runs at once</Line>
        )}
        {command.shortcut !== undefined && (
          <Line icon={<Kbd>{command.shortcut}</Kbd>}>Its shortcut</Line>
        )}
      </dl>
    </div>
  )
}

export function FilterPreview({ suggestion }: { readonly suggestion: FilterSuggestion }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Filter</span>
        <span className="font-mono text-sm font-medium wrap-anywhere">{suggestion.label}</span>
        <span className="text-muted-foreground">{suggestion.detail}</span>
      </div>
      <Line icon={<Filter className="size-3.5" />}>
        Different keys must all match; values of one key are alternatives.
      </Line>
    </div>
  )
}

const PREFIXES: ReadonlyArray<readonly [string, string]> = [
  [">", "Actions only"],
  ["#", "Threads, with is: project: provider: branch:"],
  ["?", "Search the messages of every thread"],
  ["@", "A file of the open thread"],
  ["/", "A skill for the open thread"],
]

export function EmptyPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 text-xs">
      <span className="text-muted-foreground">Start with</span>
      <dl className="flex flex-col gap-2">
        {PREFIXES.map(([key, label]) => (
          <Line key={key} icon={<Kbd>{key}</Kbd>}>
            {label}
          </Line>
        ))}
      </dl>
    </div>
  )
}

function Line({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="flex w-5 shrink-0 justify-center text-muted-foreground">{icon}</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  )
}
