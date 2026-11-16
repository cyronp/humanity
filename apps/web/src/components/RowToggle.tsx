import { cn } from "cn"
import type { ReactNode } from "react"
import { Toggle } from "@/components/ui/toggle"

/**
 * A small on/off icon button inside a menu or list row, like a pin or a star:
 * shadcn's `Toggle`, sized for a row. Pressing it never also picks the row nor
 * closes the menu.
 */
export function RowToggle({
  label,
  pressed,
  disabled = false,
  onToggle,
  className,
  children,
}: {
  /** What pressing it does, for its accessible label and tooltip. */
  readonly label: string
  readonly pressed: boolean
  readonly disabled?: boolean
  readonly onToggle: () => void
  readonly className?: string
  /** The icon; it reads `aria-pressed` from the button to fill itself in. */
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
      // Not the `disabled` prop: a click on a disabled button would fall
      // through to the row and pick it.
      aria-disabled={disabled}
      // Stopped here, the click still toggles but never reaches the row.
      onClick={(event) => event.stopPropagation()}
      // Menus pick an item on pointer up.
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
