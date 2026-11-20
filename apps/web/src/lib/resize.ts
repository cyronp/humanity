import { useCallback, useState } from "react"

export type ResizeEdge = "start" | "end" | "top"

export const isVerticalEdge = (edge: ResizeEdge) => edge === "top"

export const KEYBOARD_STEP = 16

export const clampWidth = (width: number, min: number, max: number) =>
  Math.round(Math.min(Math.max(width, min), Math.max(min, max)))

export const dragWidth = (start: number, dx: number, edge: ResizeEdge, min: number, max: number) =>
  clampWidth(start + (edge === "end" ? dx : -dx), min, max)

export const parseStoredWidth = (raw: string | null): number | null => {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

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
      } catch {}
    },
    [key],
  )
  return [width, setWidth] as const
}
