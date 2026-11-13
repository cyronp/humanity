import type { Project, Session, SessionStatus } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import {
  CircleCheck,
  GitBranch,
  LoaderCircle,
  type LucideIcon,
  MessageCircleQuestionMark,
  SquareTerminal,
} from "lucide-react"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { ProviderIcon, sessionProvider } from "@/features/providers/ProviderIcon"
import { formatElapsed, useNow } from "@/lib/elapsed"

/**
 * One thread in the sidebar, live or in the history: the project's icon, its
 * name and how long the thread has been in its state; the thread's title; its
 * branch, whether it started in Claude Code, and the provider.
 */
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
      className="flex w-full rounded-md p-2 text-left ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <ProjectIcon project={project} className="size-4" />
            <span className="truncate text-xs font-medium text-muted-foreground">
              {project.name}
            </span>
          </span>
          <ThreadTime session={session} />
        </div>
        <span className="truncate text-sm">{session.title}</span>
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1 text-xs">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate font-mono">{session.branch}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {session.origin === "claude-code" && (
              <span title="Started in Claude Code">
                <SquareTerminal className="size-3.5" aria-hidden />
                <span className="sr-only">Started in Claude Code</span>
              </span>
            )}
            <ProviderIcon provider={sessionProvider(session)} className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/**
 * How each state shows in the row's corner. A state with a `badge` shows it
 * (icon and word) in place of the time; the others show the time, with a dot.
 */
const STATE: Record<
  SessionStatus,
  {
    readonly label: string
    readonly text: string
    readonly dot?: string
    readonly badge?: { readonly word: string; readonly icon: LucideIcon; readonly spin?: true }
  }
> = {
  running: {
    label: "Working",
    text: "text-blue-600 dark:text-blue-400 font-medium",
    badge: { word: "Working", icon: LoaderCircle, spin: true },
  },
  waiting_for_human: {
    label: "Needs input",
    text: "text-sky-500 dark:text-sky-300 font-medium",
    badge: { word: "Input", icon: MessageCircleQuestionMark },
  },
  idle: {
    label: "Done",
    text: "text-emerald-600 dark:text-emerald-400 font-medium",
    badge: { word: "Done", icon: CircleCheck },
  },
  interrupted: { label: "Interrupted", text: "", dot: "bg-muted-foreground/50" },
  error: {
    label: "Stopped with an error",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  ended: { label: "Ended", text: "" },
}

/**
 * The thread's state, or how long it has been in it. The daemon stamps
 * `updatedAt` on every status change, so the time counts from there; it is
 * always in the tooltip. A live thread's corner gives way to its end button on
 * hover; an ended one has none.
 */
function ThreadTime({ session }: { readonly session: Session }) {
  const live = session.status === "running" || session.status === "waiting_for_human"
  const now = useNow(live ? 1000 : 30_000)
  const state = STATE[session.status]
  const elapsed = formatElapsed(now - Date.parse(session.updatedAt))
  const badge = state.badge
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums",
        session.status !== "ended" &&
          "transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 pointer-coarse:opacity-0",
        state.text,
      )}
      title={`${state.label} · ${elapsed}`}
    >
      {badge !== undefined ? (
        <>
          <badge.icon
            className={cn("size-3.5 shrink-0", badge.spin && "animate-spin")}
            aria-hidden
          />
          <span aria-hidden>{badge.word}</span>
          <span className="sr-only">{state.label}</span>
        </>
      ) : (
        <>
          {state.dot !== undefined && <span className={cn("size-1.5 rounded-full", state.dot)} />}
          <span className="sr-only">{state.label}, </span>
          <time dateTime={session.updatedAt}>{elapsed}</time>
        </>
      )}
    </span>
  )
}
