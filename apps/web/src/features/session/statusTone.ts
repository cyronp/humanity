import type { SessionStatus } from "@humanity/contracts"

/**
 * The one colour each state of a thread has, wherever it shows: the sidebar's
 * rows and the project's list of threads. `undefined` reads plain.
 */
export type StatusTone = "info" | "warning" | "success" | "destructive"

export const STATUS_TONE: Record<SessionStatus, StatusTone | undefined> = {
  running: "info",
  waiting_for_human: "warning",
  idle: "success",
  interrupted: undefined,
  error: "destructive",
  ended: undefined,
}

export const TONE_TEXT: Record<StatusTone, string> = {
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
  destructive: "text-destructive",
}
