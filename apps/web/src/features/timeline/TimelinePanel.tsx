import { approvalKey } from "@humanity/contracts"
import { cn } from "cn"
import { Ban, Check, CircleCheck, CircleX, Clock, LoaderCircle, UserCheck, X } from "lucide-react"
import { useMemo } from "react"
import type { SessionView } from "@/features/session/state"
import { formatDuration } from "@/features/tools/inputs"
import { ApprovalBadge, ToolSummary } from "@/features/tools/ToolCallCard"
import { buildTimeline, describeDecision, type TimelineEntry } from "./timeline.ts"

const time = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

const TOOL_ICON = {
  running: <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />,
  succeeded: <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
  failed: <X className="size-3.5 text-red-600 dark:text-red-400" />,
  denied: <Ban className="size-3.5 text-amber-600 dark:text-amber-400" />,
} as const

const decisionIcon = (entry: Extract<TimelineEntry, { _tag: "decision" }>) => {
  const status =
    entry.approval._tag === "change"
      ? entry.approval.change.status
      : entry.approval.confirmation.status
  if (status === "applied" || status === "allowed") {
    return <CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
  }
  if (status === "expired") return <Clock className="size-3.5 text-muted-foreground" />
  if (status === "partially_applied") return <UserCheck className="size-3.5 text-amber-600" />
  return <CircleX className="size-3.5 text-red-600 dark:text-red-400" />
}

/** Tool calls, Skill loads and human decisions, in the order they happened. */
export function TimelinePanel({ view }: { readonly view: SessionView }) {
  const entries = useMemo(() => buildTimeline(view), [view])
  const skills = view.skills

  if (entries.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nothing yet. Tool calls, loaded skills and your decisions show up here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-xs">
      {skills.length > 0 && (
        <p className="text-muted-foreground">
          Skills loaded: {skills.map((skill) => skill.skill).join(", ")}
        </p>
      )}
      <ol className="flex flex-col">
        {entries.map((entry) => (
          <li
            key={
              entry._tag === "tool"
                ? `tool:${entry.call.id}`
                : `decision:${approvalKey(entry.approval)}`
            }
            className={cn(
              "grid grid-cols-[4.5rem_1rem_1fr_auto] items-center gap-2 border-b py-1.5 last:border-b-0",
              entry._tag === "decision" && "bg-muted/40",
            )}
          >
            <time className="text-muted-foreground tabular-nums" dateTime={entry.at}>
              {time(entry.at)}
            </time>
            {entry._tag === "tool" ? TOOL_ICON[entry.call.status] : decisionIcon(entry)}
            <span className="min-w-0">
              {entry._tag === "tool" ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <ToolSummary
                      toolName={entry.call.toolName}
                      input={entry.call.input}
                      call={entry.call}
                      approval={entry.approval}
                      worktreePath={view.session.worktreePath}
                    />
                  </span>
                  <ApprovalBadge
                    approval={entry.approval}
                    denied={entry.call.status === "denied"}
                  />
                </span>
              ) : (
                <span className="font-medium">{describeDecision(entry.approval)}</span>
              )}
            </span>
            <span className="text-right text-muted-foreground tabular-nums">
              {entry._tag === "tool"
                ? entry.durationMs === undefined
                  ? "…"
                  : formatDuration(entry.durationMs)
                : entry.waitedMs === undefined
                  ? ""
                  : `waited ${formatDuration(entry.waitedMs)}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
