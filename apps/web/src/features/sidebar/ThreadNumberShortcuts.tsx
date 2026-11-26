import { useAtomValue } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useRef } from "react"
import { insideTerminal } from "@/features/palette/registry"
import { projectsAtom } from "@/features/projects/atoms"
import { allSessionsAtom } from "@/features/session/atoms"
import { isMac } from "@/features/terminal/keys"
import { threadFilterAtom } from "./atoms.ts"
import { numberedThreads, threadAtNumber, threadNumberOf } from "./threadNumbers.ts"

export function ThreadNumberShortcuts() {
  const sessions = useAtomValue(allSessionsAtom)
  const projects = useAtomValue(projectsAtom)
  const filter = useAtomValue(threadFilterAtom)
  const navigate = useNavigate()

  const threads = useMemo(() => {
    if (!AsyncResult.isSuccess(sessions) || !AsyncResult.isSuccess(projects)) return []
    const byId = new Map(projects.value.map((project) => [project.id, project] as const))
    const all = sessions.value.flatMap((session) => {
      const project = byId.get(session.projectId)
      return project === undefined ? [] : [{ session, project }]
    })
    return numberedThreads(all, filter)
  }, [sessions, projects, filter])

  const latest = useRef(threads)
  useEffect(() => {
    latest.current = threads
  }, [threads])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const number = threadNumberOf(event, isMac())
      if (number === undefined || insideTerminal(event.target)) return
      const thread = threadAtNumber(latest.current, number)
      if (thread === undefined) return
      event.preventDefault()
      event.stopPropagation()
      void navigate({
        to: "/projects/$projectId/sessions/$sessionId",
        params: { projectId: thread.projectId, sessionId: thread.id },
      })
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [navigate])

  return null
}
