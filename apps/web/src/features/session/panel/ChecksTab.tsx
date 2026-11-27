import type {
  BranchPublication,
  CheckStatus,
  Forge,
  PullRequestCheck,
  Session,
} from "@humanity/contracts"
import { cn } from "cn"
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleSlash,
  CircleX,
  LoaderCircle,
} from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { PanelEmpty } from "@/components/PanelEmpty"
import { ForgeLink } from "./ForgeLink.tsx"
import { checksPhrase, summarizeChecks } from "./publication.ts"
import { usePullRequestFeed } from "./usePullRequestFeed.ts"

export const CHECK_ICON: Record<
  CheckStatus,
  { readonly Icon: typeof CircleCheck; readonly className: string; readonly label: string }
> = {
  success: { Icon: CircleCheck, className: "text-success", label: "Passed" },
  failure: { Icon: CircleX, className: "text-destructive", label: "Failed" },
  running: { Icon: LoaderCircle, className: "animate-spin text-warning", label: "Running" },
  queued: { Icon: CircleDashed, className: "text-warning", label: "Queued" },
  cancelled: { Icon: CircleSlash, className: "text-muted-foreground", label: "Cancelled" },
  skipped: { Icon: CircleMinus, className: "text-muted-foreground", label: "Skipped" },
  neutral: { Icon: CircleMinus, className: "text-muted-foreground", label: "Neutral" },
}

const OVERALL = {
  failure: { word: "Failing", status: "failure" },
  pending: { word: "Running", status: "running" },
  success: { word: "All checks passed", status: "success" },
} as const

export function ChecksTab({
  session,
  publication,
}: {
  readonly session: Session
  readonly publication: BranchPublication
}) {
  const feed = usePullRequestFeed(session.id, publication.branch)
  return (
    <AsyncView result={feed} errorTitle="Could not load the checks">
      {(value) => <Pipeline checks={value.checks} forge={publication.forge} />}
    </AsyncView>
  )
}

function Pipeline({
  checks,
  forge,
}: {
  readonly checks: ReadonlyArray<PullRequestCheck>
  readonly forge: Forge | null
}) {
  const summary = summarizeChecks(checks)
  if (summary.overall === "none") {
    return <PanelEmpty>No checks reported for the latest commit.</PanelEmpty>
  }
  const overall = OVERALL[summary.overall]
  const { Icon, className } = CHECK_ICON[overall.status]
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1.5 text-sm">
        <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
        <span className="font-medium">{overall.word}</span>
        <span className="truncate text-xs text-muted-foreground">{checksPhrase(checks)}</span>
      </p>
      <ol className="flex flex-col">
        {checks.map((check, index) => (
          <CheckStep
            key={`${check.name}-${index}`}
            check={check}
            forge={forge}
            last={index === checks.length - 1}
          />
        ))}
      </ol>
    </div>
  )
}

function CheckStep({
  check,
  forge,
  last,
}: {
  readonly check: PullRequestCheck
  readonly forge: Forge | null
  readonly last: boolean
}) {
  const { Icon, className, label } = CHECK_ICON[check.status]
  const took = duration(check.startedAt, check.finishedAt)
  const detail = [took === null ? label : `${label} in ${took}`, check.description]
    .filter((part) => part !== null && part !== "")
    .join(" · ")
  return (
    <li className={cn("group/step relative flex gap-3", !last && "pb-4")}>
      {!last && <span aria-hidden className="absolute top-6 bottom-0.5 left-2.5 w-px bg-border" />}
      <Icon className={cn("size-5 shrink-0", className)} aria-label={label} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{check.name}</span>
          {check.url !== null && (
            <ForgeLink
              url={check.url}
              forge={forge}
              label={`Open ${check.name}`}
              className="-my-1 opacity-70 group-hover/step:opacity-100"
            />
          )}
        </div>
        <span
          className={cn(
            "text-xs",
            check.status === "failure" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      </div>
    </li>
  )
}

const duration = (startedAt: string | null, finishedAt: string | null): string | null => {
  if (startedAt === null || finishedAt === null) return null
  const seconds = Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
