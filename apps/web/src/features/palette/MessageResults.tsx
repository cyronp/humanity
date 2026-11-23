import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  type MessageHit,
  SEARCH_MIN_LENGTH,
  type SearchHitKind,
  snippetParts,
} from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Bot, type LucideIcon, User, Wrench } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"
import { projectsAtom } from "@/features/projects/atoms"
import { allSessionsAtom, searchMessagesAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"

const SEARCH_DELAY_MS = 200

const KIND_ICON: Record<SearchHitKind, { readonly icon: LucideIcon; readonly label: string }> = {
  human: { icon: User, label: "You" },
  agent: { icon: Bot, label: "Agent" },
  tool: { icon: Wrench, label: "Tool call" },
}

export function MessageResults({
  query,
  onPick,
}: {
  readonly query: string
  readonly onPick: () => void
}) {
  const search = useAtomSet(searchMessagesAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  const sessions = useAtomValue(allSessionsAtom)
  const projects = useAtomValue(projectsAtom)
  const [found, setFound] = useState<{
    readonly query: string
    readonly hits: ReadonlyArray<MessageHit>
    readonly error?: string
  }>()
  const searchable = [...query.trim()].length >= SEARCH_MIN_LENGTH

  useEffect(() => {
    if (!searchable) return
    let current = true
    const timer = setTimeout(() => {
      void search({ payload: { query } }).then((exit) => {
        if (!current) return
        setFound(
          Exit.isSuccess(exit)
            ? { query, hits: exit.value }
            : { query, hits: [], error: describeCause(exit.cause) },
        )
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, search, searchable])

  const titles = useMemo(() => {
    const map = new Map<string, { readonly title: string; readonly project: string }>()
    if (!AsyncResult.isSuccess(sessions) || !AsyncResult.isSuccess(projects)) return map
    const names = new Map(projects.value.map((project) => [project.id, project.name] as const))
    for (const session of sessions.value) {
      map.set(session.id, { title: session.title, project: names.get(session.projectId) ?? "" })
    }
    return map
  }, [projects, sessions])

  if (!searchable) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        Type at least {SEARCH_MIN_LENGTH} characters to search every thread’s messages.
      </p>
    )
  }
  if (found?.query !== query) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
        <Spinner /> Searching…
      </div>
    )
  }
  if (found.error !== undefined) {
    return <p className="px-3 py-6 text-center text-sm text-destructive">{found.error}</p>
  }
  if (found.hits.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">No message matches.</p>
    )
  }
  return (
    <CommandGroup heading="Messages">
      {found.hits.map((hit, index) => {
        const thread = titles.get(hit.sessionId)
        const kind = KIND_ICON[hit.kind]
        return (
          <CommandItem
            key={`${hit.messageId}-${index}`}
            value={`${hit.messageId}-${index}`}
            onSelect={() => {
              onPick()
              void navigate({
                to: "/projects/$projectId/sessions/$sessionId",
                params: { projectId: hit.projectId, sessionId: hit.sessionId },
                search: { message: hit.messageId },
              })
            }}
            className="flex-col items-start gap-1"
          >
            <span className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <kind.icon className="size-3.5 shrink-0" aria-label={kind.label} />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {thread?.title ?? "A thread"}
              </span>
              <span className="shrink-0">{thread?.project}</span>
            </span>
            <span className="line-clamp-2 w-full text-sm wrap-anywhere">
              {snippetParts(hit.snippet).map((part, position) =>
                part.marked ? (
                  <mark key={position} className="rounded-sm bg-warning/25 px-0.5 text-foreground">
                    {part.text}
                  </mark>
                ) : (
                  <span key={position}>{part.text}</span>
                ),
              )}
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
