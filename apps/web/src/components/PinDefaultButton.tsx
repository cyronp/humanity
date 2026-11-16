import { cn } from "cn"
import { Pin } from "lucide-react"
import { RowToggle } from "@/components/RowToggle"

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
  return (
    <RowToggle
      label={
        pinned
          ? `Unpin ${label} as the default for new threads`
          : `Pin ${label} as the default for new threads`
      }
      pressed={pinned}
      disabled={disabled}
      onToggle={onToggle}
      {...(className === undefined ? {} : { className })}
    >
      <Pin className={cn("size-3.5", pinned && "fill-current")} />
    </RowToggle>
  )
}
