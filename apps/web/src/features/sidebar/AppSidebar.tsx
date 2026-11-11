import { useAtomValue } from "@effect/atom-react"
import type { Project, Session, SessionStatus } from "@humanity/contracts"
import { Link, useParams } from "@tanstack/react-router"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { CircleHelp, FolderGit2, GitBranch, SquarePen } from "lucide-react"
import { useMemo } from "react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ClaudeStatusBadge } from "@/features/claude/ClaudeStatusBadge"
import { projectsAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { ProviderIcon, sessionProvider } from "@/features/providers/ProviderIcon"
import { allSessionsAtom } from "@/features/session/atoms"
import { EndSessionButton } from "@/features/session/EndSessionButton"
import { formatElapsed, useNow } from "@/lib/elapsed"

/** Sessions that are not over: idle, running, waiting for the human, interrupted or failed. */
const isOpen = (session: Session) => session.status !== "ended"

/** The app's left column: new chat, the open conversations, and app-wide controls. */
export function AppSidebar() {
  const { setOpenMobile } = useSidebar()
  // Choosing a destination on a phone closes the sheet the sidebar lives in.
  const close = () => setOpenMobile(false)
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="mb-2 flex items-center gap-2 pl-2">
          <Link to="/" onClick={close} className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="font-semibold tracking-tight">Humanity</span>
          </Link>
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/" onClick={close} activeOptions={{ exact: true }}>
                <SquarePen />
                <span>New chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/projects" onClick={close}>
                <FolderGit2 />
                <span>Projects</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <Conversations onNavigate={close} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-1">
        <div className="min-w-0 flex-1">
          <ClaudeStatusBadge />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/welcome" onClick={close} aria-label="How Humanity works">
                <CircleHelp />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>How Humanity works</TooltipContent>
        </Tooltip>
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function Conversations({ onNavigate }: { readonly onNavigate: () => void }) {
  const sessions = useAtomValue(allSessionsAtom)
  const projects = useAtomValue(projectsAtom)
  const { sessionId: activeId } = useParams({ strict: false })

  const byId = useMemo(
    () =>
      new Map(
        AsyncResult.isSuccess(projects)
          ? projects.value.map((project) => [project.id, project] as const)
          : [],
      ),
    [projects],
  )

  if (!AsyncResult.isSuccess(sessions)) {
    return AsyncResult.isFailure(sessions) ? (
      <p className="px-2 text-xs text-muted-foreground">Could not load conversations.</p>
    ) : (
      <SidebarMenu>
        {[0, 1, 2].map((key) => (
          <SidebarMenuItem key={key}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    )
  }

  const open = sessions.value.filter(isOpen).flatMap((session) => {
    const project = byId.get(session.projectId)
    return project === undefined ? [] : [{ session, project }]
  })
  if (open.length === 0) {
    return (
      <p className="px-2 text-xs text-muted-foreground">
        No conversations yet. Start one with New chat.
      </p>
    )
  }
  return (
    <SidebarMenu className="gap-0.5">
      {open.map(({ session, project }) => (
        <SidebarMenuItem key={session.id}>
          <ConversationLink
            session={session}
            project={project}
            active={session.id === activeId}
            onNavigate={onNavigate}
          />
          {/* Takes the place of the time on hover or keyboard focus; always shown on touch screens. */}
          <EndSessionButton
            session={session}
            className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 pointer-coarse:opacity-100"
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

/**
 * One conversation: the project's icon, its name and how long the session has
 * been in its state; the conversation's title; its branch and the provider.
 */
function ConversationLink({
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
          <SessionTime session={session} />
        </div>
        <span className="truncate text-sm">{session.title}</span>
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1 text-xs">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate font-mono">{session.branch}</span>
          </span>
          <ProviderIcon provider={sessionProvider(session)} className="size-3.5" />
        </div>
      </div>
    </Link>
  )
}

const STATE: Record<
  Exclude<SessionStatus, "ended">,
  { readonly label: string; readonly dot: string | null; readonly text: string }
> = {
  running: { label: "Running", dot: "bg-emerald-500 animate-pulse", text: "" },
  waiting_for_human: {
    label: "Waiting for you",
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-600 dark:text-amber-400 font-medium",
  },
  idle: { label: "Idle", dot: null, text: "" },
  interrupted: { label: "Interrupted", dot: "bg-muted-foreground/50", text: "" },
  error: {
    label: "Stopped with an error",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
}

/**
 * How long the session has been in its current state. The daemon stamps
 * `updatedAt` on every status change, so this counts from there.
 */
function SessionTime({ session }: { readonly session: Session }) {
  const live = session.status === "running" || session.status === "waiting_for_human"
  const now = useNow(live ? 1000 : 30_000)
  if (session.status === "ended") return null
  const state = STATE[session.status]
  const elapsed = formatElapsed(now - Date.parse(session.updatedAt))
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 pointer-coarse:opacity-0",
        state.text,
      )}
      title={`${state.label} · ${elapsed}`}
    >
      {state.dot !== null && <span className={cn("size-1.5 rounded-full", state.dot)} />}
      <span className="sr-only">{state.label}, </span>
      <time dateTime={session.updatedAt}>{elapsed}</time>
    </span>
  )
}
