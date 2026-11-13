import { cn } from "cn"
import { Pin } from "lucide-react"

/**
 * The pin on a picker's option: it makes that option the start of every new
 * thread. Pinning another option moves the pin; pressing a pinned one removes it.
 */
export function PinDefaultButton({
  label,
  pinned,
  disabled = false,
  onToggle,
  className,
}: {
  /** The option's name, for the button's accessible label. */
  readonly label: string
  readonly pinned: boolean
  readonly disabled?: boolean
  readonly onToggle: () => void
  readonly className?: string
}) {
  const hint = pinned
    ? `Unpin ${label} as the default for new threads`
    : `Pin ${label} as the default for new threads`
  return (
    <button
      type="button"
      aria-label={hint}
      aria-pressed={pinned}
      title={hint}
      // Not the `disabled` attribute: a click on a disabled button would fall
      // through to the option and pick it.
      aria-disabled={disabled}
      // Pinning an option must not also pick it, nor close the menu.
      onClick={(event) => {
        event.stopPropagation()
        if (!disabled) onToggle()
      }}
      onPointerUp={(event) => event.stopPropagation()}
      className={cn(
        "pointer-events-auto flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-background hover:text-foreground aria-disabled:opacity-40",
        pinned && "text-foreground",
        className,
      )}
    >
      <Pin className={cn("size-3.5", pinned && "fill-current")} />
    </button>
  )
}
