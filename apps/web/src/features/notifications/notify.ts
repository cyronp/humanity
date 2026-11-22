import type { Session, SessionStatus } from "@humanity/contracts"
import type { UiPreferences } from "@/lib/uiPreferences"

export type NotificationKind = "waiting" | "finished" | "failed"

export interface ThreadNotification {
  readonly kind: NotificationKind
  readonly title: string
  readonly body: string
}

const ACTIVE: ReadonlySet<SessionStatus> = new Set(["running", "waiting_for_human"])

export const notificationFor = (
  previous: SessionStatus | undefined,
  session: Pick<Session, "title" | "status">,
  preferences: Pick<UiPreferences, "notifyWaiting" | "notifyFinished" | "notifyFailed">,
): ThreadNotification | undefined => {
  if (previous === undefined || previous === session.status) return undefined
  const name = `“${session.title}”`
  if (session.status === "waiting_for_human" && preferences.notifyWaiting) {
    return { kind: "waiting", title: "Waiting for you", body: `${name} needs your answer.` }
  }
  if (session.status === "idle" && previous === "running" && preferences.notifyFinished) {
    return { kind: "finished", title: "Thread finished", body: `${name} is done.` }
  }
  if (session.status === "error" && ACTIVE.has(previous) && preferences.notifyFailed) {
    return { kind: "failed", title: "Thread stopped", body: `${name} stopped on an error.` }
  }
  return undefined
}

export const notificationsSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window

export const notificationPermission = (): NotificationPermission | "unsupported" =>
  notificationsSupported() ? Notification.permission : "unsupported"

export const requestNotifications = async (): Promise<NotificationPermission | "unsupported"> => {
  if (!notificationsSupported()) return "unsupported"
  if (Notification.permission !== "default") return Notification.permission
  return Notification.requestPermission()
}

let audio: AudioContext | undefined

export const playChime = (): void => {
  try {
    audio ??= new AudioContext()
    const context = audio
    const start = context.currentTime
    for (const [offset, frequency] of [
      [0, 880],
      [0.12, 1320],
    ] as const) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.15, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start + offset)
      oscillator.stop(start + offset + 0.3)
    }
  } catch {}
}
