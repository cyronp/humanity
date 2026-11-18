import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import {
  FileDiff,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  PanelRightClose,
  RefreshCw,
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  publicationAtom,
  refreshPullRequestAtom,
  sessionCommitsAtom,
  sessionDiffAtom,
} from "../atoms.ts"
import { CommitsTab } from "./CommitsTab.tsx"
import { CommitTab } from "./CommitTab.tsx"
import { DiffTab } from "./DiffTab.tsx"
import { PullRequestTab } from "./PullRequestTab.tsx"
import { SetupWorktreeButton } from "./SetupWorktreeButton.tsx"
import {
  SHELF_LABELS,
  SHELF_TOOLS,
  type ShelfState,
  type ShelfTool,
  shelfBadges,
  toggleTool,
} from "./shelf.ts"

const ICONS: Readonly<Record<ShelfTool, ReactNode>> = {
  changes: <FileDiff />,
  commits: <History />,
  commit: <GitCommitHorizontal />,
  "pull-request": <GitPullRequest />,
}

/**
 * The shelf on the right of a thread: a rail of tool icons, always shown, and the open tool's
 * panel beside it. Every tool works on the folder and branch of this thread.
 */
export function SessionShelf({
  session,
  activity,
  shelf,
  onShelfChange,
  onReference,
}: {
  readonly session: Session
  readonly activity: number
  readonly shelf: ShelfState
  readonly onShelfChange: (shelf: ShelfState) => void
  readonly onReference?: ((reference: string) => void) | undefined
}) {
  const rail = (
    <ToolRail
      session={session}
      shelf={shelf}
      onSelect={(tool) => onShelfChange(toggleTool(shelf, tool))}
    />
  )
  if (!shelf.open) return rail
  return (
    <ToolPanel
      session={session}
      activity={activity}
      tool={shelf.tool}
      onToolChange={(tool) => onShelfChange({ open: true, tool })}
      onClose={() => onShelfChange({ ...shelf, open: false })}
      onReference={onReference}
      rail={rail}
    />
  )
}

function ToolRail({
  session,
  shelf,
  onSelect,
}: {
  readonly session: Session
  readonly shelf: ShelfState
  readonly onSelect: (tool: ShelfTool) => void
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  const publication = useAtomValue(publicationAtom(session.id))
  const refreshDiff = useAtomRefresh(sessionDiffAtom(session.id))
  const refreshPublication = useAtomRefresh(publicationAtom(session.id))

  useEffect(() => {
    refreshDiff()
    refreshPublication()
  }, [session.status, session.branch, refreshDiff, refreshPublication])

  const badges = shelfBadges(
    AsyncResult.isSuccess(diff) ? diff.value : undefined,
    AsyncResult.isSuccess(publication) ? publication.value : undefined,
  )

  return (
    <nav
      aria-label="Tools"
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-1 py-2",
        shelf.open && "border-l",
      )}
    >
      {SHELF_TOOLS.map((tool) => {
        const active = shelf.open && shelf.tool === tool
        const badge = badges[tool]
        return (
          <Tooltip key={tool}>
            <TooltipTrigger asChild>
              <Button
                variant={active ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={SHELF_LABELS[tool]}
                aria-pressed={active}
                onClick={() => onSelect(tool)}
                className={cn("relative", !active && "text-muted-foreground")}
              >
                {ICONS[tool]}
                {badge !== undefined && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground tabular-nums">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {badge === undefined
                ? SHELF_LABELS[tool]
                : `${SHELF_LABELS[tool]} (${tool === "changes" ? `${badge} changed` : `${badge} to push`})`}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

function ToolPanel({
  session,
  activity,
  tool,
  onToolChange,
  onClose,
  onReference,
  rail,
}: {
  readonly session: Session
  readonly activity: number
  readonly tool: ShelfTool
  readonly onToolChange: (tool: ShelfTool) => void
  readonly onClose: () => void
  readonly onReference?: ((reference: string) => void) | undefined
  readonly rail: ReactNode
}) {
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(new Set())
  const setFileOpen = (key: string, open: boolean) =>
    setOpenFiles((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  const refreshDiff = useAtomRefresh(sessionDiffAtom(session.id))
  const refreshCommits = useAtomRefresh(sessionCommitsAtom(session.id))
  const refreshPublication = useAtomRefresh(publicationAtom(session.id))
  const refreshPullRequest = useAtomSet(refreshPullRequestAtom)

  useEffect(() => {
    refreshDiff()
    refreshCommits()
    refreshPublication()
  }, [activity, session.branch, refreshDiff, refreshCommits, refreshPublication])

  const refresh = () => {
    refreshDiff()
    refreshCommits()
    refreshPublication()
    refreshPullRequest({ payload: { sessionId: session.id } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="titlebar flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3 pr-[calc(var(--titlebar-controls)+--spacing(3))]">
        <h2 className="truncate text-sm font-medium">{SHELF_LABELS[tool]}</h2>
        <div className="flex items-center gap-1">
          <SetupWorktreeButton session={session} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close the panel"
            title="Close the panel"
          >
            <PanelRightClose />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {tool === "changes" && (
              <DiffTab
                session={session}
                onReference={onReference}
                open={openFiles}
                onOpenChange={setFileOpen}
              />
            )}
            {tool === "commits" && <CommitsTab session={session} />}
            {tool === "commit" && (
              <CommitTab session={session} onOpenPullRequest={() => onToolChange("pull-request")} />
            )}
            {tool === "pull-request" && (
              <PullRequestTab session={session} onOpenCommit={() => onToolChange("commit")} />
            )}
          </div>
        </ScrollArea>
        {rail}
      </div>
    </div>
  )
}
