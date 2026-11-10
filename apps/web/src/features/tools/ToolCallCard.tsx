import type { Approval, ToolCall } from "@humanity/contracts"
import { cn } from "cn"
import { Ban, Check, ChevronRight, LoaderCircle, X } from "lucide-react"
import { useState } from "react"
import { findRenderer, type ToolCallProps } from "./registry.ts"
import { toolRenderers } from "./renderers/index.ts"

export { describeInput } from "./inputs.ts"

const STATUS_ICON = {
  running: <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />,
  succeeded: <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />,
  failed: <X className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />,
  denied: <Ban className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />,
} as const

/** The one-line summary of a call, from its renderer. Shared by the chat and the timeline. */
export function ToolSummary(props: ToolCallProps) {
  const { Summary } = findRenderer(toolRenderers, props.toolName, props.input)
  return <Summary {...props} />
}

/** A tool call inline in the chat: one line, expandable to its renderer's detail view. */
export function ToolCallCard({
  toolName,
  input,
  call,
  approval,
  worktreePath,
}: {
  readonly toolName: string
  readonly input: unknown
  readonly call: ToolCall | undefined
  readonly approval?: Approval | undefined
  readonly worktreePath?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const status = call?.status ?? "running"
  const props: ToolCallProps = { toolName, input, call, approval, worktreePath }
  const { Summary, Detail } = findRenderer(toolRenderers, toolName, input)

  return (
    <div className="rounded-md border bg-card text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        {STATUS_ICON[status]}
        <span className="min-w-0 flex-1">
          <Summary {...props} />
        </span>
        <ApprovalBadge approval={approval} denied={status === "denied"} />
      </button>
      {open && (
        <div className="border-t p-2.5">
          <Detail {...props} />
        </div>
      )}
    </div>
  )
}

const OUTCOME_LABEL: Record<string, string> = {
  pending: "waiting for you",
  applied: "applied",
  partially_applied: "partially applied",
  rejected: "rejected",
  expired: "expired",
  allowed: "allowed",
  denied: "denied",
}

/** Where the human's decision on this call stands, if it needed one. */
export function ApprovalBadge({
  approval,
  denied,
}: {
  readonly approval: Approval | undefined
  readonly denied: boolean
}) {
  const status =
    approval === undefined
      ? denied
        ? "denied"
        : undefined
      : approval._tag === "change"
        ? approval.change.status
        : approval.confirmation.status
  if (status === undefined) return null
  return (
    <span
      className={cn(
        "shrink-0",
        status === "pending" && "animate-pulse font-medium text-amber-600",
        (status === "applied" || status === "allowed") && "text-emerald-600 dark:text-emerald-400",
        (status === "rejected" || status === "denied") && "text-red-600 dark:text-red-400",
        (status === "partially_applied" || status === "expired") && "text-amber-600",
      )}
    >
      {OUTCOME_LABEL[status] ?? status}
    </span>
  )
}
