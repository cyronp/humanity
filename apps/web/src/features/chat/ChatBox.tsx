import { cn } from "cn"
import { ArrowUp, Square } from "lucide-react"
import { type ComponentProps, type ReactNode, useState } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"

export function ChatBox({
  className,
  behind,
  ...props
}: ComponentProps<typeof InputGroup> & { readonly behind?: ReactNode }) {
  return (
    <div className="relative">
      {behind}
      <InputGroup
        className={cn(
          "z-10 rounded-2xl border-border/60 shadow-xs backdrop-blur-md",
          "[--chat-box:color-mix(in_oklab,var(--card)_75%,transparent)] focus-within:[--chat-box:var(--card)] has-[[data-state=open]]:[--chat-box:var(--card)]",
          "bg-(--chat-box) has-disabled:bg-(--chat-box) dark:bg-(--chat-box) dark:has-disabled:bg-(--chat-box)",
          "has-disabled:opacity-100 has-[[data-slot=input-group-control]:disabled]:opacity-50",
          "has-[[data-slot=input-group-control]:focus-visible]:border-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-0",
          className,
        )}
        {...props}
      />
    </div>
  )
}

export function ChatBoxFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn(
        "@container/chat-footer gap-1 px-2 pb-2 opacity-70 transition-opacity",
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

const KEY_HINT_KEY = "humanity.key-hint-sends"

/** After this many messages the keys are known, and the hint stops showing. */
const KEY_HINT_SENDS = 3

const readSends = (): number => {
  try {
    return Number(localStorage.getItem(KEY_HINT_KEY)) || 0
  } catch {
    return 0
  }
}

/** Counts a message sent from a chat box, so the key hint can retire. */
export const noteMessageSent = () => {
  try {
    localStorage.setItem(KEY_HINT_KEY, String(readSends() + 1))
  } catch {
    // Storage can be unavailable; the hint then keeps showing, which is harmless.
  }
}

/**
 * How to send and how to break a line, shown once there is something to send, until the human has
 * sent a few messages.
 */
export function KeyHint({
  typing,
  className,
}: {
  readonly typing: boolean
  readonly className?: string
}) {
  const [retired] = useState(() => readSends() >= KEY_HINT_SENDS)
  if (retired) return null
  return (
    <span
      aria-hidden
      className={cn(
        "items-center gap-1 text-xs whitespace-nowrap text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none",
        typing ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <Kbd>Enter</Kbd> to send <span className="text-muted-foreground/60">·</span> <Kbd>Shift</Kbd>+
      <Kbd>Enter</Kbd> new line
    </span>
  )
}
