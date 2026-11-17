import { useEffect, useRef } from "react"

const POLL_MS = 5000

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
