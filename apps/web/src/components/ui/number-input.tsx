import { cn } from "cn"
import { MinusIcon, PlusIcon } from "lucide-react"
import * as React from "react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

export interface NumberBounds {
  readonly min: number
  readonly max: number
  readonly step?: number
}

const decimalsOf = (step: number) => String(step).split(".")[1]?.length ?? 0

export const fitNumber = (value: number, { min, max, step = 1 }: NumberBounds): number => {
  const factor = 10 ** decimalsOf(step)
  return Math.round(Math.min(Math.max(value, min), max) * factor) / factor
}

export const stepNumber = (value: number, direction: 1 | -1, bounds: NumberBounds): number =>
  fitNumber(value + direction * (bounds.step ?? 1), bounds)

export const parseNumber = (text: string, bounds: NumberBounds): number | undefined => {
  const trimmed = text.trim().replace(",", ".")
  if (trimmed === "") return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? fitNumber(parsed, bounds) : undefined
}

export const formatNumber = (value: number, step = 1): string => value.toFixed(decimalsOf(step))

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  className,
  "aria-labelledby": labelledBy,
  "aria-label": label,
}: {
  readonly value: number
  readonly onChange: (value: number) => void
  readonly min: number
  readonly max: number
  readonly step?: number
  readonly disabled?: boolean
  readonly className?: string
  readonly "aria-labelledby"?: string
  readonly "aria-label"?: string
}) {
  const bounds = { min, max, step }
  const [draft, setDraft] = React.useState<string>()
  const shown = draft ?? formatNumber(value, step)

  const commit = (next: number) => {
    setDraft(undefined)
    if (next !== value) onChange(next)
  }

  const commitDraft = () => {
    if (draft === undefined) return
    commit(parseNumber(draft, bounds) ?? value)
  }

  const nudge = (direction: 1 | -1) =>
    commit(stepNumber(parseNumber(shown, bounds) ?? value, direction, bounds))

  return (
    <InputGroup
      data-slot="number-input"
      data-disabled={disabled || undefined}
      className={cn(
        "w-32 has-disabled:bg-transparent has-disabled:opacity-100 dark:has-disabled:bg-input/30",
        "data-disabled:bg-input/50 data-disabled:opacity-50 dark:data-disabled:bg-input/80",
        className,
      )}
    >
      <InputGroupAddon align="inline-start">
        <InputGroupButton
          size="icon-xs"
          tabIndex={-1}
          aria-label="Decrease"
          disabled={disabled || value <= min}
          onClick={() => nudge(-1)}
        >
          <MinusIcon />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        role="spinbutton"
        inputMode={decimalsOf(step) > 0 ? "decimal" : "numeric"}
        aria-labelledby={labelledBy}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        disabled={disabled}
        value={shown}
        className="px-0 text-center tabular-nums"
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commitDraft()
          } else if (event.key === "Escape" && draft !== undefined) {
            event.preventDefault()
            event.stopPropagation()
            setDraft(undefined)
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            nudge(event.key === "ArrowUp" ? 1 : -1)
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          tabIndex={-1}
          aria-label="Increase"
          disabled={disabled || value >= max}
          onClick={() => nudge(1)}
        >
          <PlusIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export { NumberInput }
