import { useCallback, useSyncExternalStore } from "react"

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
