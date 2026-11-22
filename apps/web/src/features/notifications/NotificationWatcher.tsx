import { useAtomValue } from "@effect/atom-react"
import type { SessionStatus } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useRef } from "react"
import { allSessionsAtom } from "@/features/session/atoms"
import { useUiPreferences } from "@/lib/uiPreferences"
import { notificationFor, notificationPermission, playChime } from "./notify.ts"

export function NotificationWatcher() {
  const sessions = useAtomValue(allSessionsAtom)
  const [preferences] = useUiPreferences()
  const navigate = useNavigate()
  const statuses = useRef<Map<string, SessionStatus> | undefined>(undefined)

  useEffect(() => {
    if (!AsyncResult.isSuccess(sessions)) return
    const previous = statuses.current
    statuses.current = new Map(sessions.value.map((session) => [session.id, session.status]))
    if (previous === undefined) return
    for (const session of sessions.value) {
      const notification = notificationFor(previous.get(session.id), session, preferences)
      if (notification === undefined) continue
      const watching =
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        window.location.pathname.includes(session.id)
      if (watching) continue
      if (preferences.notifySound) playChime()
      if (notificationPermission() !== "granted") continue
      const shown = new Notification(notification.title, {
        body: notification.body,
        tag: `humanity-${session.id}`,
      })
      shown.onclick = () => {
        window.focus()
        void navigate({
          to: "/projects/$projectId/sessions/$sessionId",
          params: { projectId: session.projectId, sessionId: session.id },
        })
        shown.close()
      }
    }
  }, [sessions, preferences, navigate])

  return null
}
