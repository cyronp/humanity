import { useCallback, useSyncExternalStore } from "react"

/**
 * True while the window is narrower than `width` CSS pixels. Read from the
 * media query as the page renders, so the first frame already has the right
 * answer instead of correcting itself a frame later.
 */
export function useIsBelowWidth(width: number): boolean {
  const query = `(max-width: ${width - 1}px)`
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
