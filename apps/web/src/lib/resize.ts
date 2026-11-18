import { useCallback, useState } from "react"

/** Which edge of the resized element the handle sits on; on the top edge it resizes the height. */
export type ResizeEdge = "start" | "end" | "top"

export const isVerticalEdge = (edge: ResizeEdge) => edge === "top"

/** How far one press of an arrow key moves a handle. */
export const KEYBOARD_STEP = 16

export const clampWidth = (width: number, min: number, max: number) =>
  Math.round(Math.min(Math.max(width, min), Math.max(min, max)))

/**
 * The size after the pointer moved `dx` pixels (down, for the top edge) from where the drag
 * started. A handle on the end edge grows the element when dragged right; one on the start edge,
 * when dragged left; one on the top edge, when dragged up.
 */
export const dragWidth = (start: number, dx: number, edge: ResizeEdge, min: number, max: number) =>
  clampWidth(start + (edge === "end" ? dx : -dx), min, max)

export const parseStoredWidth = (raw: string | null): number | null => {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * A width the human set by dragging, remembered in the browser; `null` until they do, or after
 * they reset it, so the layout's own default applies.
 */
export const useStoredWidth = (key: string) => {
  const [width, setWidthState] = useState<number | null>(() => {
    try {
      return parseStoredWidth(localStorage.getItem(key))
    } catch {
      return null
    }
  })
  const setWidth = useCallback(
    (next: number | null) => {
      setWidthState(next)
      try {
        if (next === null) localStorage.removeItem(key)
        else localStorage.setItem(key, String(next))
      } catch {
        // Storage can be unavailable (private windows, blocked site data); the width still applies.
      }
    },
    [key],
  )
  return [width, setWidth] as const
}
