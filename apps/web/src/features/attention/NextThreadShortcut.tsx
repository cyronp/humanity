import { useAtomValue } from "@effect/atom-react"
import { useNavigate, useParams } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  insideTerminal,
  type PaletteCommand,
  usePaletteCommands,
} from "@/features/palette/registry"
import { allSessionsAtom } from "@/features/session/atoms"
import { isMac } from "@/features/terminal/keys"
import { isNextThreadShortcut, nextThreadNeedingYou, threadsNeedingYou } from "./nextThread.ts"

export function NextThreadShortcut() {
  const sessions = useAtomValue(allSessionsAtom)
  const navigate = useNavigate()
  const { sessionId } = useParams({ strict: false })
  const all = useMemo(() => (AsyncResult.isSuccess(sessions) ? sessions.value : []), [sessions])
  const waiting = threadsNeedingYou(all).length

  const jump = useCallback(() => {
    const next = nextThreadNeedingYou(all, sessionId)
    if (next === undefined) return
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: next.projectId, sessionId: next.id },
    })
  }, [all, navigate, sessionId])

  const latest = useRef(jump)
  useEffect(() => {
    latest.current = jump
  }, [jump])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isNextThreadShortcut(event, isMac()) || insideTerminal(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  const commands = useMemo(
    (): ReadonlyArray<PaletteCommand> =>
      waiting === 0
        ? []
        : [
            {
              id: "thread.next-needing-you",
              title: "Go to the next thread that needs you",
              group: "General",
              detail: waiting === 1 ? "1 thread" : `${waiting} threads`,
              shortcut: isMac() ? "⌘J" : "Ctrl+J",
              keywords: ["waiting", "input", "error", "jump", "attention"],
              run: () => latest.current(),
            },
          ],
    [waiting],
  )
  usePaletteCommands("attention", commands)

  return null
}
