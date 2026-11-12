import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { Link, useParams } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { Search, Settings, SquarePen } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { BrandMark } from "@/components/BrandMark"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AccountSwitcher } from "@/features/claude/AccountSwitcher"
import { projectsAtom } from "@/features/projects/atoms"
import { allSessionsAtom } from "@/features/session/atoms"
import { EndSessionButton } from "@/features/session/EndSessionButton"
import { openSettings } from "@/features/settings/settings"
import { ThreadFilterMenu } from "./ThreadFilterMenu.tsx"
import { ThreadHistory } from "./ThreadHistory.tsx"
import { ThreadLink } from "./ThreadLink.tsx"
import {
  DEFAULT_THREAD_FILTER,
  isDefaultFilter,
  readStoredFilter,
  selectThreads,
  storeFilter,
  type ThreadFilter,
} from "./threadFilter.ts"

/** The app's left column: new chat, the conversations, the history of ended ones, and app-wide controls. */
export function AppSidebar() {
  const { setOpenMobile } = useSidebar()
  // Choosing a destination on a phone closes the sheet the sidebar lives in.
  const close = () => setOpenMobile(false)
  const projectsResult = useAtomValue(projectsAtom)
  const projects = AsyncResult.isSuccess(projectsResult) ? projectsResult.value : []
  const [query, setQuery] = useState("")
  const [filter, setFilterState] = useState(readStoredFilter)
  const setFilter = (next: ThreadFilter) => {
    setFilterState(next)
    storeFilter(next)
  }
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="mt-1 mb-4 flex items-center gap-2 pl-2">
          <Link to="/" onClick={close} className="flex min-w-0 flex-1 items-center gap-2">
            <BrandMark className="h-6 w-auto shrink-0" />
            <span className="font-semibold tracking-tight">Humanity</span>
          </Link>
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <div className="flex items-center gap-0.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query !== "") {
                  event.preventDefault()
                  setQuery("")
                }
              }}
              placeholder="Search"
              aria-label="Search"
              className="border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <ThreadFilterMenu filter={filter} onChange={setFilter} projects={projects} />
          <HeaderLink label="New chat" onClick={close} exact to="/">
            <SquarePen />
          </HeaderLink>
        </div>
      </SidebarHeader>
      {/* shadcn's scroll fade: the list fades out at whichever edge has more threads past it. */}
      <SidebarContent viewportClassName="scroll-fade-y">
        <SidebarGroup>
          <SidebarGroupContent>
            <Conversations
              onNavigate={close}
              projects={projects}
              query={query}
              filter={filter}
              onReset={() => {
                setQuery("")
                setFilter(DEFAULT_THREAD_FILTER)
              }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <ThreadHistory projects={projects} query={query} filter={filter} onNavigate={close} />
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-1">
        <AccountSwitcher onNavigate={close} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Settings"
              onClick={() => {
                close()
                openSettings()
              }}
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** An icon-only link in the header row, named by its tooltip. */
function HeaderLink({
  to,
  label,
  exact = false,
  onClick,
  children,
}: {
  readonly to: "/"
  readonly label: string
  readonly exact?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          asChild
        >
          <Link to={to} onClick={onClick} activeOptions={{ exact }} aria-label={label}>
            {children}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Conversations({
  onNavigate,
  projects,
  query,
  filter,
  onReset,
}: {
  readonly onNavigate: () => void
  readonly projects: ReadonlyArray<Project>
  readonly query: string
  readonly filter: ThreadFilter
  readonly onReset: () => void
}) {
  const sessions = useAtomValue(allSessionsAtom)
  const { sessionId: activeId } = useParams({ strict: false })

  const byId = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
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

  const all = sessions.value.flatMap((session) => {
    const project = byId.get(session.projectId)
    return project === undefined ? [] : [{ session, project }]
  })
  const shown = selectThreads(all, query, filter)
  if (shown.length === 0) {
    const narrowed = query.trim() !== "" || !isDefaultFilter(filter)
    return narrowed ? (
      <div className="flex flex-col items-start gap-1 px-2 text-xs text-muted-foreground">
        <p>No conversations match.</p>
        <Button variant="link" size="xs" className="h-auto p-0" onClick={onReset}>
          Clear search and filters
        </Button>
      </div>
    ) : (
      <p className="px-2 text-xs text-muted-foreground">
        No conversations yet. Start one with New chat.
      </p>
    )
  }
  return (
    <SidebarMenu className="gap-0.5">
      {shown.map(({ session, project }) => (
        <SidebarMenuItem key={session.id}>
          <ThreadLink
            session={session}
            project={project}
            active={session.id === activeId}
            onNavigate={onNavigate}
          />
          {/* Takes the place of the time on hover or keyboard focus; always shown on touch screens. */}
          {session.status !== "ended" && (
            <EndSessionButton
              session={session}
              className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 pointer-coarse:opacity-100"
            />
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
