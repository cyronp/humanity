import { useEffect, useState } from "react"

/**
 * A short duration for tight spaces: `12s`, `5m`, `3h`, `2d`, `6w`.
 * Under a second (or a clock that runs slightly behind) reads `now`.
 */
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

/** The current time, refreshed every `intervalMs`. */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
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

/** How long ago `iso` was, spelled out: `41 minutes ago`, `yesterday`, `3 weeks ago`. */
export const formatTimeAgo = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.round((now - Date.parse(iso)) / 1000)
  if (Number.isNaN(seconds)) return ""
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit)
  }
  return "just now"
}
