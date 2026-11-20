import type { Project, Session, SessionStatus } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import {
  Archive,
  CircleAlert,
  CircleCheck,
  CirclePause,
  GitBranch,
  GitFork,
  LoaderCircle,
  type LucideIcon,
  MessageCircleQuestionMark,
  SquareTerminal,
} from "lucide-react"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { ProviderIcon, sessionProvider } from "@/features/providers/ProviderIcon"
import { STATUS_TONE, TONE_TEXT } from "@/features/session/statusTone"
import { formatElapsed, useNow } from "@/lib/elapsed"

export function ThreadLink({
  session,
  project,
  active,
  onNavigate,
}: {
  readonly session: Session
  readonly project: Project
  readonly active: boolean
  readonly onNavigate: () => void
}) {
  return (
    <Link
      to="/projects/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.id }}
      onClick={onNavigate}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className="flex w-full rounded-md p-2 text-left ring-sidebar-ring outline-hidden transition-colors group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{session.title}</span>
          <ThreadTime session={session} />
        </div>
        <ThreadBranch session={session} />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <ThreadStatus status={session.status} />
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            <span className="truncate">{project.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
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

const STATE: Record<
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

function ThreadStatus({ status }: { readonly status: SessionStatus }) {
  const state = STATE[status]
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

function ThreadTime({ session }: { readonly session: Session }) {
  const live = session.status === "running" || session.status === "waiting_for_human"
  const now = useNow(live ? 1000 : 30_000)
  const elapsed = formatElapsed(now - Date.parse(session.updatedAt))
  return (
    <time
      dateTime={session.updatedAt}
      className={cn(
        "shrink-0 text-xs text-muted-foreground tabular-nums",
        session.status !== "ended" &&
          "transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 pointer-coarse:opacity-0",
      )}
    >
      {elapsed}
    </time>
  )
}
