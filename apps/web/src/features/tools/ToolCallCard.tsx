import type { Approval, ToolCall } from "@humanity/contracts"
import { cn } from "cn"
import { Ban, Check, ChevronRight, LoaderCircle, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"

/** The one input value that best describes a call, for its summary line. */
export const describeInput = (input: unknown): string => {
  if (input === null || typeof input !== "object") return ""
  const record = input as Record<string, unknown>
  for (const key of ["command", "file_path", "notebook_path", "pattern", "url", "query", "skill"]) {
    const value = record[key]
    if (typeof value === "string" && value !== "") return value
  }
  const first = Object.values(record).find((value) => typeof value === "string")
  return typeof first === "string" ? first : ""
}

const STATUS_ICON = {
  running: <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />,
  succeeded: <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
  failed: <X className="size-3.5 text-red-600 dark:text-red-400" />,
  denied: <Ban className="size-3.5 text-amber-600 dark:text-amber-400" />,
} as const

/**
 * A tool call inline in the chat: one line, expandable to the full input and
 * output. Per-tool renderers replace the expanded view later; this is the
 * fallback every call gets.
 */
export function ToolCallCard({
  toolName,
  input,
  call,
  approval,
}: {
  readonly toolName: string
  readonly input: unknown
  readonly call: ToolCall | undefined
  readonly approval?: Approval | undefined
}) {
  const [open, setOpen] = useState(false)
  const status = call?.status ?? "running"
  const summary = describeInput(input)

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
        <Badge variant="outline" className="font-mono">
          {toolName}
        </Badge>
        <span className="truncate font-mono text-muted-foreground">{summary}</span>
        <ApprovalBadge approval={approval} denied={status === "denied"} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t p-2.5">
          <Section title="Input">{JSON.stringify(input, null, 2)}</Section>
          {call?.output != null && (
            <Section title={call.output.isError ? "Error" : "Output"}>
              {call.output.content}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { readonly title: string; readonly children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-muted-foreground">{title}</span>
      <pre className="max-h-80 overflow-auto rounded bg-muted/60 p-2 font-mono whitespace-pre-wrap break-all">
        {children === "" ? "(empty)" : children}
      </pre>
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
function ApprovalBadge({
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
        "ml-auto shrink-0",
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
