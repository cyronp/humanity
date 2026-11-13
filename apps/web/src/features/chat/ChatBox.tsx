import { cn } from "cn"
import { ArrowUp, Square } from "lucide-react"
import type { ComponentProps } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"

/**
 * The message box shared by a new thread and an open one: a soft, rounded
 * surface whose controls sit in its bottom row. At rest it is slightly
 * see-through and blurs what is behind it; it turns solid while the human is
 * in it or one of its menus is open.
 */
export function ChatBox({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      className={cn(
        "rounded-2xl border-border/60 shadow-xs backdrop-blur-md",
        // One variable carries the surface, so every state of the group paints the same colour.
        "[--chat-box:color-mix(in_oklab,var(--card)_75%,transparent)] focus-within:[--chat-box:var(--card)] has-[[data-state=open]]:[--chat-box:var(--card)]",
        "bg-(--chat-box) has-disabled:bg-(--chat-box) dark:bg-(--chat-box) dark:has-disabled:bg-(--chat-box)",
        // An empty box has a disabled send button; only a disabled text field dims the box.
        "has-disabled:opacity-100 has-[[data-slot=input-group-control]:disabled]:opacity-50",
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        className,
      )}
      {...props}
    />
  )
}

/**
 * The box's bottom row: controls on the left, `ml-auto` pushes the rest right.
 * The controls are dimmed at rest and light up while the box is focused, one
 * of its menus is open, or there is text to send.
 */
export function ChatBoxFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn(
        "gap-1 px-2 pb-2 opacity-70 transition-opacity",
        "group-focus-within/input-group:opacity-100 group-has-[[data-state=open]]/input-group:opacity-100 group-has-[textarea:not(:placeholder-shown)]/input-group:opacity-100",
        className,
      )}
      {...props}
    />
  )
}

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

/**
 * The send button's place while the agent works and nothing is typed: a red
 * stop that ends the agent's current turn. The thread stays open.
 */
export function StopButton({
  onStop,
  stopping,
}: {
  readonly onStop: () => void
  /** The stop was asked for and the agent has not stopped yet. */
  readonly stopping: boolean
}) {
  return (
    <InputGroupButton
      type="button"
      size="icon-sm"
      className="rounded-full bg-destructive text-white hover:bg-destructive/90 hover:text-white focus-visible:ring-destructive/40 dark:bg-destructive/80 dark:hover:bg-destructive"
      disabled={stopping}
      onClick={onStop}
      aria-label={stopping ? "Stopping the agent" : "Stop the agent"}
      title="Stop the agent"
    >
      <Square className="size-3 fill-current" />
    </InputGroupButton>
  )
}
