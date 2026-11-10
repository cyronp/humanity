import { cn } from "cn"
import { ArrowUp } from "lucide-react"
import type { ComponentProps } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"

/**
 * The message box shared by a new thread and an open one: a soft, rounded
 * surface whose controls sit in its bottom row, with a quiet focus state.
 */
export function ChatBox({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      className={cn(
        "rounded-2xl border-border/60 bg-muted/40 shadow-xs dark:bg-input/30",
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        className,
      )}
      {...props}
    />
  )
}

/** The box's bottom row: controls on the left, `ml-auto` pushes the rest right. */
export function ChatBoxFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon align="block-end" className={cn("gap-1 px-2 pb-2", className)} {...props} />
  )
}

/** The round send button: filled once there is something to send. */
export function SendButton({
  ready,
  disabled,
  label,
}: {
  readonly ready: boolean
  readonly disabled: boolean
  readonly label: string
}) {
  return (
    <InputGroupButton
      type="submit"
      size="icon-sm"
      variant={ready ? "default" : "secondary"}
      className="rounded-full"
      disabled={disabled}
      aria-label={label}
    >
      <ArrowUp />
    </InputGroupButton>
  )
}
