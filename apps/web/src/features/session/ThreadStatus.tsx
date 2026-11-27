import type { SessionStatus } from "@humanity/contracts"
import { cn } from "cn"
import {
  Archive,
  CircleAlert,
  CircleCheck,
  CirclePause,
  LoaderCircle,
  type LucideIcon,
  MessageCircleQuestionMark,
} from "lucide-react"
import { STATUS_TONE, TONE_TEXT } from "./statusTone.ts"

export const THREAD_STATE: Record<
  SessionStatus,
  {
    readonly label: string
    readonly word: string
    readonly icon: LucideIcon
    readonly spin?: true
  }
> = {
  running: { label: "Working", word: "Working", icon: LoaderCircle, spin: true },
  waiting_for_human: { label: "Needs input", word: "Input", icon: MessageCircleQuestionMark },
  idle: { label: "Done", word: "Done", icon: CircleCheck },
  interrupted: { label: "Interrupted", word: "Interrupted", icon: CirclePause },
  error: { label: "Stopped with an error", word: "Error", icon: CircleAlert },
  ended: { label: "Ended", word: "Ended", icon: Archive },
}

export function ThreadStatus({ status }: { readonly status: SessionStatus }) {
  const state = THREAD_STATE[status]
  const tone = STATUS_TONE[status]
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1", tone !== undefined && TONE_TEXT[tone])}
      title={state.label}
    >
      <state.icon className={cn("size-3 shrink-0", state.spin && "animate-spin")} aria-hidden />
      <span aria-hidden>{state.word}</span>
      <span className="sr-only">{state.label}</span>
    </span>
  )
}
