import { cn } from "cn"

type Tone = "ok" | "warning" | "error"

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
}

/**
 * A small status light. Colour is never the only signal: it sits next to
 * text, or on a control whose label says the same.
 */
export function ToneDot({ tone, className }: { readonly tone: Tone; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE_CLASS[tone], className)}
    />
  )
}
