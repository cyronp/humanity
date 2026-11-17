import { cn } from "cn"
import { ArrowUp, Square } from "lucide-react"
import type { ComponentProps } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"

export function ChatBox({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      className={cn(
        "rounded-2xl border-border/60 shadow-xs backdrop-blur-md",
        "[--chat-box:color-mix(in_oklab,var(--card)_75%,transparent)] focus-within:[--chat-box:var(--card)] has-[[data-state=open]]:[--chat-box:var(--card)]",
        "bg-(--chat-box) has-disabled:bg-(--chat-box) dark:bg-(--chat-box) dark:has-disabled:bg-(--chat-box)",
        "has-disabled:opacity-100 has-[[data-slot=input-group-control]:disabled]:opacity-50",
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        className,
      )}
      {...props}
    />
  )
}

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

export function StopButton({
  onStop,
  stopping,
}: {
  readonly onStop: () => void
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
