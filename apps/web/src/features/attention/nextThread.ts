import type { Session, SessionStatus } from "@humanity/contracts"
import { modPressed, type ShortcutKey } from "@/lib/shortcuts"

const NEEDS_YOU: ReadonlyArray<SessionStatus> = ["waiting_for_human", "error"]

export const needsYou = (session: Session): boolean => NEEDS_YOU.includes(session.status)

export const threadsNeedingYou = (sessions: ReadonlyArray<Session>): ReadonlyArray<Session> =>
  sessions
    .filter(needsYou)
    .toSorted(
      (a, b) =>
        NEEDS_YOU.indexOf(a.status) - NEEDS_YOU.indexOf(b.status) ||
        Date.parse(a.updatedAt) - Date.parse(b.updatedAt) ||
        a.id.localeCompare(b.id),
    )

export const nextThreadNeedingYou = (
  sessions: ReadonlyArray<Session>,
  currentId: string | undefined,
): Session | undefined => {
  const queue = threadsNeedingYou(sessions)
  const at = queue.findIndex((session) => session.id === currentId)
  if (at === -1) return queue[0]
  const next = queue[(at + 1) % queue.length]
  return next?.id === currentId ? undefined : next
}

export const isNextThreadShortcut = (event: ShortcutKey, mac: boolean): boolean => {
  return (
    modPressed(event, mac) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "j"
  )
}
