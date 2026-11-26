import { useLayoutEffect, useState } from "react"

const SETTLE_MS = 1500
const INTENT_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const

export const usePinToEndWhileSettling = (
  viewport: HTMLElement | null,
  content: HTMLElement | null,
  enabled: boolean,
) => {
  const [settleUntil] = useState(() => performance.now() + SETTLE_MS)
  useLayoutEffect(() => {
    const left = settleUntil - performance.now()
    if (!enabled || viewport === null || content === null || left <= 0) return
    const observer = new ResizeObserver(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
    const stop = () => {
      observer.disconnect()
      clearTimeout(timer)
      for (const type of INTENT_EVENTS) viewport.removeEventListener(type, stop)
    }
    const timer = setTimeout(stop, left)
    for (const type of INTENT_EVENTS) viewport.addEventListener(type, stop, { passive: true })
    observer.observe(content)
    observer.observe(viewport)
    return stop
  }, [settleUntil, enabled, viewport, content])
}
