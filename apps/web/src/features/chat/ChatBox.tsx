import { cn } from "cn"
import { ArrowUp, Square } from "lucide-react"
import { type ComponentProps, type KeyboardEvent, type ReactNode, useState } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { isMac } from "@/features/terminal/keys"
import { type SendKey, uiPreferences, useUiPreferences } from "@/lib/uiPreferences"
import { readStored, writeStored } from "@/lib/storage"

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

const KEY_HINT_KEY = "humanity.key-hint-sends"

const KEY_HINT_SENDS = 3

const readSends = (): number => Number(readStored(KEY_HINT_KEY)) || 0

export const noteMessageSent = () => writeStored(KEY_HINT_KEY, String(readSends() + 1))

const KEY = "h-4 min-w-4 px-1 text-[0.625rem] leading-none"

export const useKeyHintShown = (): boolean => useState(() => readSends() < KEY_HINT_SENDS)[0]

export const isSendKey = (
  event: {
    readonly key: string
    readonly shiftKey: boolean
    readonly ctrlKey: boolean
    readonly metaKey: boolean
    readonly isComposing: boolean
  },
  sendKey: SendKey,
): boolean => {
  if (event.key !== "Enter" || event.isComposing) return false
  return sendKey === "enter" ? !event.shiftKey : event.ctrlKey || event.metaKey
}

export const sendKeyPressed = (event: KeyboardEvent<HTMLTextAreaElement>): boolean =>
  isSendKey(
    {
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    },
    uiPreferences().sendKey,
  )

export function KeyHint({
  typing,
  className,
}: {
  readonly typing: boolean
  readonly className?: string
}) {
  const shown = useKeyHintShown()
  const [{ sendKey }] = useUiPreferences()
  if (!shown) return null
  return (
    <span
      aria-hidden
      className={cn(
        "items-center gap-1 text-xs whitespace-nowrap text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none",
        typing ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {sendKey === "enter" ? (
        <>
          <Kbd className={KEY}>Enter</Kbd> to send{" "}
          <span className="text-muted-foreground/60">·</span> <Kbd className={KEY}>Shift</Kbd>+
          <Kbd className={KEY}>Enter</Kbd> new line
        </>
      ) : (
        <>
          <Kbd className={KEY}>{isMac() ? "⌘" : "Ctrl"}</Kbd>+<Kbd className={KEY}>Enter</Kbd> to
          send <span className="text-muted-foreground/60">·</span> <Kbd className={KEY}>Enter</Kbd>{" "}
          new line
        </>
      )}
    </span>
  )
}
