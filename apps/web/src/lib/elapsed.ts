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
