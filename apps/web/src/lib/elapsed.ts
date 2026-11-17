import { useSyncExternalStore } from "react"

export const formatElapsed = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 1) return "now"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

interface Clock {
  now: number
  readonly listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | undefined
}

const clocks = new Map<number, Clock>()

const clockFor = (intervalMs: number): Clock => {
  let clock = clocks.get(intervalMs)
  if (clock === undefined) {
    clock = { now: Date.now(), listeners: new Set(), timer: undefined }
    clocks.set(intervalMs, clock)
  }
  return clock
}

export const sharedClock = (intervalMs: number) => ({
  subscribe: (listener: () => void): (() => void) => {
    const clock = clockFor(intervalMs)
    clock.listeners.add(listener)
    if (clock.timer === undefined) {
      clock.now = Date.now()
      clock.timer = setInterval(() => {
        clock.now = Date.now()
        for (const each of clock.listeners) each()
      }, intervalMs)
    }
    return () => {
      clock.listeners.delete(listener)
      if (clock.listeners.size > 0) return
      clearInterval(clock.timer)
      clocks.delete(intervalMs)
    }
  },
  getSnapshot: (): number => clockFor(intervalMs).now,
})

const shared = new Map<number, ReturnType<typeof sharedClock>>()

export const useNow = (intervalMs: number): number => {
  let clock = shared.get(intervalMs)
  if (clock === undefined) {
    clock = sharedClock(intervalMs)
    shared.set(intervalMs, clock)
  }
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot)
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

export const formatTimeAgo = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.round((now - Date.parse(iso)) / 1000)
  if (Number.isNaN(seconds)) return ""
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit)
  }
  return "just now"
}
