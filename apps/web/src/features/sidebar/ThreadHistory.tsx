import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { useParams } from "@tanstack/react-router"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { ChevronDown } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { allSessionsAtom } from "@/features/session/atoms"
import { selectHistory, type ThreadFilter } from "./threadFilter.ts"
import { ThreadLink } from "./ThreadLink.tsx"

/** How many ended threads the history opens with, and how many each "Show more" adds. */
const FIRST_PAGE = 10
const NEXT_PAGE = 25

/** A ghost button drawn as a divider: muted label, a rule across the sidebar, a chevron. */
const DIVIDER_BUTTON =
  "w-full gap-3 px-2 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"

/**
 * The threads that are over, and the conversations imported from Claude Code,
 * folded away at the bottom of the sidebar under an "Ended" divider
 * that expands into the same rows as the list above, newest first. The
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
  const listId = useId()

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
    <SidebarGroup className="mt-auto">
      <Button
        variant="ghost"
        size="sm"
        className={DIVIDER_BUTTON}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        Ended
        <span className="sr-only">, {ended.length} threads</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
        <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} />
      </Button>
      {open && (
        <SidebarGroupContent id={listId} className="pt-1">
          {ended.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {threads.some((thread) => thread.session.status === "ended")
                ? "No ended threads match."
                : "No ended threads yet. A thread moves here when you end it, and your Claude Code conversations in a project's folder show up here too."}
            </p>
          ) : (
            <SidebarMenu className="gap-0.5">
              {shown.map(({ session, project }) => (
                <SidebarMenuItem key={session.id}>
                  <ThreadLink
                    session={session}
                    project={project}
                    active={session.id === activeId}
                    onNavigate={onNavigate}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
          {remaining > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(DIVIDER_BUTTON, "mt-0.5")}
              onClick={() => setLimit((current) => current + NEXT_PAGE)}
            >
              Show {Math.min(NEXT_PAGE, remaining)} more
              <span aria-hidden className="h-px flex-1 bg-border" />
              <ChevronDown />
            </Button>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
