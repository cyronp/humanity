import { cn } from "cn"
import type { ClaudeTone } from "./summary.ts"

const TONE_CLASS: Record<ClaudeTone | "pending", string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
  pending: "animate-pulse bg-muted-foreground/50",
}

/**
 * A small status light. Colour is never the only signal: it sits next to
 * text, or on a control whose label says the same.
 */
export function ToneDot({
  tone,
  className,
}: {
  readonly tone: ClaudeTone | "pending"
  readonly className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE_CLASS[tone], className)}
    />
  )
}
