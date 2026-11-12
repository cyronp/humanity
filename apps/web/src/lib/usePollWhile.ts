import { useEffect, useRef } from "react"

const POLL_MS = 5000

/**
 * Calls `poll` every few seconds while `active`, so something the human does
 * in a terminal (a login, an install) shows up by itself. A tick is skipped
 * while `busy`: a check that is still running is not asked for again.
 */
export function usePollWhile(active: boolean, poll: () => void, busy: boolean) {
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      if (!busyRef.current) poll()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, poll])
}
