import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { Link, useParams } from "@tanstack/react-router"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { ChevronDown, History } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { allSessionsAtom } from "@/features/session/atoms"
import { formatElapsed, useNow } from "@/lib/elapsed"
import { selectHistory, type ThreadFilter } from "./threadFilter.ts"

/** How many ended threads the history opens with, and how many each "Show more" adds. */
const FIRST_PAGE = 10
const NEXT_PAGE = 25

/**
 * The threads that are over, folded away at the bottom of the sidebar: a ghost
 * button with their count that expands into a compact list, newest first. The
 * sidebar's search and project filter narrow it like the list above.
 */
export function ThreadHistory({
  projects,
  query,
  filter,
  onNavigate,
}: {
  readonly projects: ReadonlyArray<Project>
  readonly query: string
  readonly filter: ThreadFilter
  readonly onNavigate: () => void
}) {
  const sessions = useAtomValue(allSessionsAtom)
  const { sessionId: activeId } = useParams({ strict: false })
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(FIRST_PAGE)
  const now = useNow(60_000)
  const listId = useId()
  const group = useRef<HTMLDivElement>(null)

  // The button sits at the bottom edge, so the list it opens starts off screen.
  useEffect(() => {
    if (open) group.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [open, limit])

  // The list above already says when the threads are loading or could not load.
  if (!AsyncResult.isSuccess(sessions)) return null

  const threads = sessions.value.flatMap((session) => {
    const project = projects.find((candidate) => candidate.id === session.projectId)
    return project === undefined ? [] : [{ session, project }]
  })
  const ended = selectHistory(threads, query, filter)
  const shown = ended.slice(0, limit)
  const remaining = ended.length - shown.length

  return (
    <SidebarGroup ref={group} className="mt-auto">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between px-2 text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <History />
          History
        </span>
        <span className="flex items-center gap-1.5 text-xs tabular-nums">
          <span className="sr-only">Ended threads: </span>
          {ended.length}
          <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} />
        </span>
      </Button>
      {open && (
        <SidebarGroupContent id={listId} className="pt-1">
          {ended.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {threads.some((thread) => thread.session.status === "ended")
                ? "No ended threads match."
                : "No ended threads yet. A thread moves here when you end it."}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {shown.map(({ session, project }) => (
                <li key={session.id}>
                  <Link
                    to="/projects/$projectId/sessions/$sessionId"
                    params={{ projectId: project.id, sessionId: session.id }}
                    onClick={onNavigate}
                    data-active={session.id === activeId}
                    aria-current={session.id === activeId ? "page" : undefined}
                    title={`${project.name} · ${session.title}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <ProjectIcon project={project} className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <time
                      dateTime={session.updatedAt}
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                    >
                      {formatElapsed(now - Date.parse(session.updatedAt))}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {remaining > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-0.5 w-full justify-start gap-2 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setLimit((current) => current + NEXT_PAGE)}
            >
              <ChevronDown />
              Show {Math.min(NEXT_PAGE, remaining)} more
            </Button>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
