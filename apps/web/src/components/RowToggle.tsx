import { cn } from "cn"
import type { ReactNode } from "react"
import { Toggle } from "@/components/ui/toggle"

export function RowToggle({
  label,
  pressed,
  disabled = false,
  onToggle,
  className,
  children,
}: {
  readonly label: string
  readonly pressed: boolean
  readonly disabled?: boolean
  readonly onToggle: () => void
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <Toggle
      aria-label={label}
      title={label}
      pressed={pressed}
      onPressedChange={() => {
        if (!disabled) onToggle()
      }}
      aria-disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      className={cn(
        "pointer-events-auto size-6 min-w-0 shrink-0 rounded-sm px-0 text-muted-foreground/60 transition-colors hover:bg-background hover:text-foreground aria-disabled:opacity-40 aria-pressed:bg-transparent aria-pressed:text-foreground aria-pressed:hover:bg-background data-[state=on]:bg-transparent data-[state=on]:hover:bg-background",
        className,
      )}
    >
      {children}
    </Toggle>
  )
}
