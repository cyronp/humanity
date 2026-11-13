import type { Approval, ToolCall } from "@humanity/contracts"
import { cn } from "cn"
import { Ban, Check, LoaderCircle, X } from "lucide-react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { findRenderer, type ToolCallProps } from "./registry.ts"
import { toolRenderers } from "./renderers/index.ts"

export { describeInput } from "./inputs.ts"

const STATUS_ICON = {
  running: <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />,
  succeeded: <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />,
  failed: <X className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />,
  denied: <Ban className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />,
} as const

export function ToolSummary(props: ToolCallProps) {
  const { Summary } = findRenderer(toolRenderers, props.toolName, props.input)
  return <Summary {...props} />
}

/**
 * A tool call inline in the chat, on shadcn's Trace: one line that shimmers
 * while the call runs, expandable to its renderer's detail view.
 */
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
  const status = call?.status ?? "running"
  const props: ToolCallProps = { toolName, input, call, approval, worktreePath }
  const { Summary, Detail } = findRenderer(toolRenderers, toolName, input)
  // A call waiting for the human is not running; its badge says so instead.
  const waiting = approvalStatus(approval, false) === "pending"
  const line =
    status === "failed" ? "error" : status === "running" && !waiting ? "running" : undefined

  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger className="w-full text-xs">
          <TraceLine
            {...(line === undefined ? {} : { status: line })}
            className="min-w-0 flex-1 text-xs"
          >
            <TraceIcon>{STATUS_ICON[status]}</TraceIcon>
            <TraceTitle>
              <Summary {...props} />
            </TraceTitle>
          </TraceLine>
          <ApprovalBadge approval={approval} denied={status === "denied"} />
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-xs text-foreground">
          <Detail {...props} />
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

const approvalStatus = (approval: Approval | undefined, denied: boolean) =>
  approval === undefined
    ? denied
      ? "denied"
      : undefined
    : approval._tag === "change"
      ? approval.change.status
      : approval.confirmation.status

const OUTCOME_LABEL: Record<string, string> = {
  pending: "waiting for you",
  applied: "applied",
  partially_applied: "partially applied",
  rejected: "rejected",
  expired: "expired",
  allowed: "allowed",
  denied: "denied",
}

export function ApprovalBadge({
  approval,
  denied,
}: {
  readonly approval: Approval | undefined
  readonly denied: boolean
}) {
  const status = approvalStatus(approval, denied)
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
