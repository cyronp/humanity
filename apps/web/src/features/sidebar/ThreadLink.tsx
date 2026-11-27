import type { MessageHit, Project, Session, SessionStatus } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { CircleStop, Columns3, GitBranch, GitFork, Network, SquareTerminal } from "lucide-react"
import { SearchSnippet } from "@/components/SearchSnippet"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { ProviderIcon, sessionProvider } from "@/features/providers/ProviderIcon"
import { STATUS_TONE, TONE_TEXT } from "@/features/session/statusTone"
import { formatElapsed, useNow } from "@/lib/elapsed"
import { THREAD_STATE, ThreadStatus } from "@/features/session/ThreadStatus"

export function ThreadLink({
  session,
  project,
  active,
  onNavigate,
  attention,
  hit,
}: {
  readonly session: Session
  readonly project: Project
  readonly active: boolean
  readonly onNavigate: () => void
  readonly attention?: SessionStatus | undefined
  readonly hit?: MessageHit | undefined
}) {
  return (
    <Link
      to="/projects/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.id }}
      search={hit === undefined ? {} : { message: hit.messageId }}
      onClick={onNavigate}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className="flex w-full rounded-md p-2 text-left ring-sidebar-ring outline-hidden transition-colors group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{session.title}</span>
          <span className="grid shrink-0 justify-items-end">
            <ThreadTime session={session} />
            {session.status !== "ended" && (
              <span
                aria-hidden
                className="invisible col-start-1 row-start-1 hidden items-center gap-1 border border-transparent px-2 text-xs font-medium whitespace-nowrap group-focus-within/menu-item:inline-flex group-hover/menu-item:inline-flex pointer-coarse:inline-flex"
              >
                <CircleStop className="size-3" />
                End thread
              </span>
            )}
          </span>
        </div>
        <ThreadBranch session={session} />
        {hit !== undefined && (
          <SearchSnippet
            snippet={hit.snippet}
            className="line-clamp-2 text-xs text-muted-foreground"
          />
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <ThreadStatus status={session.status} />
            {attention !== undefined && <ChildAttention status={attention} />}
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            <span className="truncate">{project.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {session.groupId != null && (
              <span title="One of several runs compared">
                <Columns3 className="size-3.5" aria-hidden />
                <span className="sr-only">One of several runs compared</span>
              </span>
            )}
            {session.origin === "claude-code" && (
              <span title="Started in Claude Code">
                <SquareTerminal className="size-3.5" aria-hidden />
                <span className="sr-only">Started in Claude Code</span>
              </span>
            )}
            <ProjectIcon project={project} className="size-3.5" />
            <ProviderIcon provider={sessionProvider(session)} className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}

function ThreadBranch({ session }: { readonly session: Session }) {
  const cut = session.branch.lastIndexOf("/") + 1
  const Icon = session.inWorktree ? GitFork : GitBranch
  return (
    <span className="flex min-w-0 items-start gap-1 text-muted-foreground">
      <Icon className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span className="sr-only">{session.inWorktree ? "Worktree branch " : "Branch "}</span>
      <span className="min-w-0 font-mono text-xs leading-snug wrap-anywhere">
        <span className="text-muted-foreground/70">{session.branch.slice(0, cut)}</span>
        <span className={cn(session.status !== "ended" && "text-sidebar-foreground")}>
          {session.branch.slice(cut)}
        </span>
      </span>
    </span>
  )
}

const CHILD_ATTENTION: Partial<Record<SessionStatus, string>> = {
  waiting_for_human: "A thread started from it needs input",
  error: "A thread started from it stopped with an error",
  running: "A thread started from it is working",
}

function ChildAttention({ status }: { readonly status: SessionStatus }) {
  const label = CHILD_ATTENTION[status] ?? THREAD_STATE[status].label
  const tone = STATUS_TONE[status]
  const Icon = THREAD_STATE[status].icon
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-sm border px-1",
        tone !== undefined && TONE_TEXT[tone],
      )}
      title={label}
    >
      <Network className="size-3 shrink-0" aria-hidden />
      <Icon
        className={cn("size-3 shrink-0", THREAD_STATE[status].spin && "animate-spin")}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function ThreadTime({ session }: { readonly session: Session }) {
  const live = session.status === "running" || session.status === "waiting_for_human"
  const now = useNow(live ? 1000 : 30_000)
  const elapsed = formatElapsed(now - Date.parse(session.updatedAt))
  return (
    <time
      dateTime={session.updatedAt}
      className={cn(
        "col-start-1 row-start-1 text-xs text-muted-foreground tabular-nums",
        session.status !== "ended" &&
          "transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 pointer-coarse:opacity-0",
      )}
    >
      {elapsed}
    </time>
  )
}
