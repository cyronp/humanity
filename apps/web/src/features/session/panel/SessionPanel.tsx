import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import {
  FileDiff,
  GitCommitHorizontal,
  GitPullRequest,
  Globe,
  History,
  PanelRightClose,
  RefreshCw,
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrowserView } from "@/features/browser/BrowserView"
import type { CaptureTarget } from "@/features/browser/BrowserView"
import type { BrowserState } from "@/features/browser/useBrowser"
import {
  publicationAtom,
  refreshPullRequestAtom,
  sessionCommitsAtom,
  sessionDiffAtom,
} from "../atoms.ts"
import { SyncButton } from "../SyncButton.tsx"
import { CommitsTab } from "./CommitsTab.tsx"
import { CommitTab } from "./CommitTab.tsx"
import { DiffTab } from "./DiffTab.tsx"
import { PullRequestTab } from "./PullRequestTab.tsx"
import { SetupWorktreeButton } from "./SetupWorktreeButton.tsx"
import { SHELF_LABELS, SHELF_TOOLS, type ShelfState, type ShelfTool, shelfBadges } from "./shelf.ts"

/** The rail's width in pixels: the window's own buttons in the desktop app cover it first. */
export const RAIL_WIDTH = 48

const ICONS: Readonly<Record<ShelfTool, ReactNode>> = {
  changes: <FileDiff />,
  commits: <History />,
  commit: <GitCommitHorizontal />,
  "pull-request": <GitPullRequest />,
  browser: <Globe />,
}

/**
 * Right padding for a bar along the window's top whose right end is `covered` pixels from the
 * window's edge: what the desktop app's window buttons still cover of it, plus the usual gutter.
 */
export const titlebarPaddingEnd = (covered: number) =>
  `calc(max(0px, var(--titlebar-controls) - ${covered}px) + 0.75rem)`

/**
 * The rail of tool icons along a thread's right edge: full height and always shown. Its top is
 * left free, and draggable, where the desktop app draws the window's own buttons.
 */
export function ToolRail({
  session,
  shelf,
  browserUnseen,
  onSelect,
}: {
  readonly session: Session
  readonly shelf: ShelfState
  readonly browserUnseen: boolean
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
    <RailFrame>
      {SHELF_TOOLS.map((tool) => {
        const active = shelf.open && shelf.tool === tool
        const badge = badges[tool]
        const dot = tool === "browser" && browserUnseen
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
                {dot && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
                  />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {dot
                ? `${SHELF_LABELS[tool]} (a new address)`
                : badge === undefined
                  ? SHELF_LABELS[tool]
                  : `${SHELF_LABELS[tool]} (${tool === "changes" ? `${badge} changed` : `${badge} to push`})`}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </RailFrame>
  )
}

export function IdleToolRail() {
  return (
    <RailFrame>
      {SHELF_TOOLS.map((tool) => (
        <Tooltip key={tool}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="rounded-md">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={SHELF_LABELS[tool]}
                disabled
                className="text-muted-foreground"
              >
                {ICONS[tool]}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">{`${SHELF_LABELS[tool]}: start a thread to use it`}</TooltipContent>
        </Tooltip>
      ))}
    </RailFrame>
  )
}

function RailFrame({ children }: { readonly children: ReactNode }) {
  return (
    <nav
      aria-label="Tools"
      className="flex min-h-0 shrink-0 flex-col items-center border-l"
      style={{ width: RAIL_WIDTH }}
    >
      <div aria-hidden="true" className="titlebar h-(--titlebar-height) w-full shrink-0" />
      <div className="flex flex-col items-center gap-1 py-2">{children}</div>
    </nav>
  )
}

/**
 * The open tool's panel, between the chat and the rail. The Browser, once opened, stays mounted
 * while another tool shows, so switching tools doesn't reload its page; closing the panel stops it.
 */
export function ToolPanel({
  session,
  activity,
  tool,
  browser,
  onToolChange,
  onClose,
  onReference,
  onCapture,
}: {
  readonly session: Session
  readonly activity: number
  readonly tool: ShelfTool
  readonly browser: BrowserState
  readonly onToolChange: (tool: ShelfTool) => void
  readonly onClose: () => void
  readonly onReference?: ((reference: string) => void) | undefined
  readonly onCapture?: CaptureTarget | undefined
}) {
  const [browserMounted, setBrowserMounted] = useState(tool === "browser")
  if (tool === "browser" && !browserMounted) setBrowserMounted(true)
  const gitShown = tool !== "browser"
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(new Set())
  const setFileOpen = (key: string, open: boolean) =>
    setOpenFiles((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {gitShown && (
        <GitPanel
          session={session}
          activity={activity}
          tool={tool}
          onToolChange={onToolChange}
          onClose={onClose}
          onReference={onReference}
          openFiles={openFiles}
          onFileOpenChange={setFileOpen}
        />
      )}
      {browserMounted && (
        <BrowserView
          browser={browser}
          shown={tool === "browser"}
          onClose={onClose}
          titlebarPadding={titlebarPaddingEnd(RAIL_WIDTH)}
          onCapture={onCapture}
        />
      )}
    </div>
  )
}

function GitPanel({
  session,
  activity,
  tool,
  onToolChange,
  onClose,
  onReference,
  openFiles,
  onFileOpenChange,
}: {
  readonly session: Session
  readonly activity: number
  readonly tool: ShelfTool
  readonly onToolChange: (tool: ShelfTool) => void
  readonly onClose: () => void
  readonly onReference?: ((reference: string) => void) | undefined
  readonly openFiles: ReadonlySet<string>
  readonly onFileOpenChange: (key: string, open: boolean) => void
}) {
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
    <>
      <div
        className="titlebar flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3"
        style={{ paddingRight: titlebarPaddingEnd(RAIL_WIDTH) }}
      >
        <h2 className="truncate text-sm font-medium">{SHELF_LABELS[tool]}</h2>
        <div className="flex items-center gap-1">
          <SyncButton session={session} />
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {tool === "changes" && (
            <DiffTab
              session={session}
              onReference={onReference}
              open={openFiles}
              onOpenChange={onFileOpenChange}
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
    </>
  )
}
