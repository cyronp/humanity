import { cn } from "cn"
import { Pin } from "lucide-react"
import { RowToggle } from "@/components/RowToggle"

export function PinDefaultButton({
  label,
  pinned,
  disabled = false,
  onToggle,
  className,
}: {
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
