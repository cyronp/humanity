import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type BranchPublication,
  type PullRequest,
  type PullRequestCheck,
  type PullRequestFeed,
  type Session,
  forgeTerms,
} from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { FolderTree, GitBranch, GitPullRequestArrow, Globe, X } from "lucide-react"
import { lazy, type ReactNode, Suspense, useEffect, useId, useMemo, useState } from "react"
import { type PaletteCommand, usePaletteCommands } from "@/features/palette/registry"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrowserView } from "@/features/browser/BrowserView"
import type { CaptureTarget } from "@/features/browser/BrowserView"
import type { BrowserState } from "@/features/browser/useBrowser"
import { useWidePanel } from "@/features/layout/panelWidth"
import {
  feedKey,
  publicationAtom,
  pullRequestFeedAtom,
  refreshPullRequestAtom,
  sessionCommitsAtom,
  sessionDiffAtom,
} from "../atoms.ts"
import { ChecksBar } from "../ChecksBar.tsx"
import { ChecksButton } from "../ChecksButton.tsx"
import { SyncButton } from "../SyncButton.tsx"
import { CHECK_ICON, ChecksTab } from "./ChecksTab.tsx"
import { CommitsTab } from "./CommitsTab.tsx"
import { DiffTab } from "./DiffTab.tsx"
import { MoreMenu } from "./MoreMenu.tsx"
import { OpenPullRequestPage } from "./OpenPullRequestPage.tsx"
import { OverviewTab } from "./OverviewTab.tsx"
import { CommitBar, type PanelError, PrimaryAction } from "./PrimaryAction.tsx"
import { footerNote, primaryAction, summarizeChecks } from "./publication.ts"
import { PULL_REQUEST_STATE } from "./PullRequestHeading.tsx"
import {
  GIT_VIEW_LABELS,
  GIT_VIEWS,
  type GitView,
  readStoredGitView,
  SHELF_LABELS,
  SHELF_TOOLS,
  type ShelfState,
  type ShelfTool,
  shelfBadges,
  storeGitView,
} from "./shelf.ts"

export const RAIL_WIDTH = 48

const FilesPanel = lazy(() => import("@/features/files/FilesPanel"))

const ICONS: Readonly<Record<ShelfTool, ReactNode>> = {
  files: <FolderTree />,
  git: <GitPullRequestArrow />,
  browser: <Globe />,
}

export const titlebarPaddingEnd = (covered: number) =>
  `calc(max(0px, var(--titlebar-controls) - ${covered}px) + 0.75rem)`

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
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border bg-background px-1 text-[10px] leading-none font-medium text-foreground tabular-nums">
                    {badge.count > 99 ? "99+" : badge.count}
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
                  : `${SHELF_LABELS[tool]} (${badge.label})`}
            </TooltipContent>
          </Tooltip>
        )
      })}
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

export function ToolPanel({
  session,
  activity,
  tool,
  browser,
  onReference,
  onCapture,
}: {
  readonly session: Session
  readonly activity: number
  readonly tool: ShelfTool
  readonly browser: BrowserState
  readonly onReference?: ((reference: string) => void) | undefined
  readonly onCapture?: CaptureTarget | undefined
}) {
  useWidePanel(tool === "browser")
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
      {tool === "files" && (
        <Suspense fallback={null}>
          <FilesPanel session={session} activity={activity} onReference={onReference} />
        </Suspense>
      )}
      {tool === "git" && (
        <GitPanel
          session={session}
          activity={activity}
          onReference={onReference}
          onInsert={onCapture?.block}
          openFiles={openFiles}
          onFileOpenChange={setFileOpen}
        />
      )}
      {tool === "browser" && (
        <BrowserView
          browser={browser}
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
  onReference,
  onInsert,
  openFiles,
  onFileOpenChange,
}: {
  readonly session: Session
  readonly activity: number
  readonly onInsert?: ((text: string) => void) | undefined
  readonly onReference?: ((reference: string) => void) | undefined
  readonly openFiles: ReadonlySet<string>
  readonly onFileOpenChange: (key: string, open: boolean) => void
}) {
  const publication = useAtomValue(publicationAtom(session.id))
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

  const branch = AsyncResult.isSuccess(publication) ? publication.value : undefined
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<PanelError>()
  const [view, setView] = useState<GitView>(readStoredGitView)
  useWidePanel(opening || view === "changes")
  const body = {
    session,
    error,
    onError: setError,
    stored: view,
    onStoredChange: setView,
    onReference,
    onInsert,
    openFiles,
    onFileOpenChange,
    onOpenPullRequest: () => setOpening(true),
  }

  if (opening && branch?.forge != null && branch.branch !== null) {
    return (
      <OpenPullRequestPage
        session={session}
        publication={branch}
        forge={branch.forge}
        branch={branch.branch}
        titlebarPadding={titlebarPaddingEnd(RAIL_WIDTH)}
        onBack={() => setOpening(false)}
      />
    )
  }

  return (
    <>
      <div
        className="titlebar flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3"
        style={{ paddingRight: titlebarPaddingEnd(RAIL_WIDTH) }}
      >
        {branch === undefined ? (
          <BranchName name={session.branch} />
        ) : (
          <PanelHeading session={session} publication={branch} />
        )}
        <div className="flex shrink-0 items-center gap-1">
          <ChecksButton session={session} />
          <SyncButton session={session} />
          {branch === undefined ? (
            <MoreMenu session={session} pullRequest={null} onError={setError} onRefresh={refresh} />
          ) : (
            <FollowedMoreMenu
              session={session}
              publication={branch}
              onError={setError}
              onRefresh={refresh}
            />
          )}
        </div>
      </div>
      <ChecksBar sessionId={session.id} onInsert={onInsert} />
      {branch === undefined ? (
        <GitBody {...body} publication={undefined} feed={undefined} />
      ) : (
        <FollowedGitBody {...body} publication={branch} />
      )}
    </>
  )
}

interface GitBodyProps {
  readonly session: Session
  readonly error: PanelError | undefined
  readonly onError: (error: PanelError | undefined) => void
  readonly stored: GitView
  readonly onStoredChange: (view: GitView) => void
  readonly onInsert?: ((text: string) => void) | undefined
  readonly onReference?: ((reference: string) => void) | undefined
  readonly openFiles: ReadonlySet<string>
  readonly onFileOpenChange: (key: string, open: boolean) => void
  readonly onOpenPullRequest: () => void
}

function FollowedGitBody(props: GitBodyProps & { readonly publication: BranchPublication }) {
  const feed = useAtomValue(
    pullRequestFeedAtom(feedKey(props.session.id, props.publication.branch)),
  )
  return <GitBody {...props} feed={AsyncResult.isSuccess(feed) ? feed.value : undefined} />
}

function FollowedMoreMenu({
  session,
  publication,
  onError,
  onRefresh,
}: {
  readonly session: Session
  readonly publication: BranchPublication
  readonly onError: (error: PanelError | undefined) => void
  readonly onRefresh: () => void
}) {
  const feed = useAtomValue(pullRequestFeedAtom(feedKey(session.id, publication.branch)))
  return (
    <MoreMenu
      session={session}
      pullRequest={AsyncResult.isSuccess(feed) ? feed.value.pullRequest : null}
      onError={onError}
      onRefresh={onRefresh}
    />
  )
}

function GitBody({
  session,
  error,
  onError: setError,
  stored,
  onStoredChange,
  onReference,
  onInsert,
  openFiles,
  onFileOpenChange,
  onOpenPullRequest,
  publication,
  feed,
}: GitBodyProps & {
  readonly publication: BranchPublication | undefined
  readonly feed: PullRequestFeed | undefined
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  const commits = useAtomValue(sessionCommitsAtom(session.id))
  const tabsId = useId()

  const files = AsyncResult.isSuccess(diff) ? diff.value.files : []
  const pullRequest = feed?.pullRequest ?? null
  const pullRequestCommands = useMemo((): ReadonlyArray<PaletteCommand> => {
    if (pullRequest === null) return []
    const terms = forgeTerms(pullRequest.forge)
    return [
      {
        id: "pr.open",
        title: `Open the ${terms.noun} in ${terms.site}`,
        group: "Source control",
        detail: `${terms.symbol}${pullRequest.number} ${pullRequest.title}`,
        keywords: ["pr", "mr", "forge", "review"],
        run: () => void window.open(pullRequest.url, "_blank", "noopener,noreferrer"),
      },
      {
        id: "pr.copy",
        title: `Copy the ${terms.noun}'s link`,
        group: "Source control",
        keywords: ["pr", "mr", "url", "clipboard"],
        run: () => void navigator.clipboard?.writeText(pullRequest.url),
      },
    ]
  }, [pullRequest])
  usePaletteCommands("pull-request", pullRequestCommands)
  const views = GIT_VIEWS.filter((each) => each !== "checks" || pullRequest !== null)
  const view = views.includes(stored) ? stored : "overview"
  const setView = (next: GitView) => {
    onStoredChange(next)
    storeGitView(next)
  }

  const counts: Partial<Record<GitView, ReactNode>> = {
    changes: files.length > 0 ? <TabCount>{files.length}</TabCount> : null,
    commits: AsyncResult.isSuccess(commits) ? (
      <TabCount>{`${commits.value.commits.length}${commits.value.more ? "+" : ""}`}</TabCount>
    ) : null,
    checks: feed !== undefined && <ChecksMark checks={feed.checks} />,
  }

  const action =
    publication === undefined ? null : primaryAction({ publication, changed: files.length, feed })
  const note =
    publication === undefined
      ? null
      : footerNote({ action, publication, changed: files.length, feed })

  return (
    <>
      <div
        role="tablist"
        aria-label="Source control"
        className="flex shrink-0 gap-4 overflow-x-auto border-b px-4 scrollbar-none"
      >
        {views.map((each) => {
          const selected = each === view
          return (
            <button
              key={each}
              type="button"
              role="tab"
              id={`${tabsId}-${each}`}
              aria-selected={selected}
              aria-controls={`${tabsId}-panel`}
              onClick={() => setView(each)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm whitespace-nowrap outline-none focus-visible:text-foreground focus-visible:underline",
                selected
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {GIT_VIEW_LABELS[each]}
              {counts[each]}
            </button>
          )
        })}
      </div>
      {error !== undefined && (
        <div className="relative shrink-0 border-b p-3">
          <ErrorNote title={error.title} message={error.message} />
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-4 right-4"
            onClick={() => setError(undefined)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X />
          </Button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-${view}`}
          className={cn("flex flex-col", (view === "overview" || view === "checks") && "p-4")}
        >
          {view === "overview" && <OverviewTab session={session} />}
          {view === "changes" && (
            <DiffTab
              session={session}
              onReference={onReference}
              onInsert={onInsert}
              open={openFiles}
              onOpenChange={onFileOpenChange}
            />
          )}
          {view === "commits" && (
            <CommitsTab session={session} forge={publication?.forge ?? null} />
          )}
          {view === "checks" && publication !== undefined && (
            <ChecksTab session={session} publication={publication} />
          )}
        </div>
      </ScrollArea>
      {publication !== undefined && (action !== null || (note?.text ?? "") !== "") && (
        <div className="flex shrink-0 flex-col gap-2 border-t p-3">
          {action?.kind === "commit" ? (
            <CommitBar
              session={session}
              publication={publication}
              files={files}
              note={note?.text ?? ""}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  note?.tone === "destructive" ? "text-destructive" : "text-muted-foreground",
                )}
                title={note?.text}
              >
                {note?.text}
              </span>
              {action !== null && (
                <PrimaryAction
                  action={action}
                  session={session}
                  publication={publication}
                  feed={feed}
                  onError={setError}
                  onOpenPullRequest={onOpenPullRequest}
                />
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function TabCount({ children }: { readonly children: ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] leading-4 font-medium text-foreground tabular-nums">
      {children}
    </span>
  )
}

function ChecksMark({ checks }: { readonly checks: ReadonlyArray<PullRequestCheck> }) {
  const { overall } = summarizeChecks(checks)
  if (overall === "none") return null
  const status = overall === "failure" ? "failure" : overall === "pending" ? "running" : "success"
  const { Icon, className, label } = CHECK_ICON[status]
  return <Icon className={cn("size-3.5", className)} aria-label={label} />
}

function BranchName({ name }: { readonly name: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
      <GitBranch className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate" title={name ?? undefined}>
        {name ?? "detached HEAD"}
      </span>
    </span>
  )
}

function PanelHeading({
  session,
  publication,
}: {
  readonly session: Session
  readonly publication: BranchPublication
}) {
  const feed = useAtomValue(pullRequestFeedAtom(feedKey(session.id, publication.branch)))
  const pullRequest = AsyncResult.isSuccess(feed) ? feed.value.pullRequest : null
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BranchName name={publication.branch} />
      {pullRequest !== null && <PullRequestChip pullRequest={pullRequest} />}
    </div>
  )
}

function PullRequestChip({ pullRequest }: { readonly pullRequest: PullRequest }) {
  const { Icon, tone, label } = PULL_REQUEST_STATE[pullRequest.state]
  const terms = forgeTerms(pullRequest.forge)
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium hover:bg-accent"
      title={`${label}: ${pullRequest.title}`}
    >
      <Icon className={cn("size-3.5", tone)} />
      {terms.symbol}
      {pullRequest.number}
    </a>
  )
}
