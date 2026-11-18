import { cn } from "cn"
import { type KeyboardEvent, type PointerEvent, useRef } from "react"
import { clampWidth, dragWidth, isVerticalEdge, KEYBOARD_STEP, type ResizeEdge } from "@/lib/resize"

const KEYS: Readonly<Record<ResizeEdge, { readonly grow: string; readonly shrink: string }>> = {
  start: { grow: "ArrowLeft", shrink: "ArrowRight" },
  end: { grow: "ArrowRight", shrink: "ArrowLeft" },
  top: { grow: "ArrowUp", shrink: "ArrowDown" },
}

export function ResizeHandle({
  edge,
  label,
  value,
  min,
  max,
  measure,
  onResize,
  onReset,
  className,
}: {
  readonly edge: ResizeEdge
  readonly label: string
  readonly value?: number | undefined
  readonly min: number
  readonly max: () => number
  readonly measure: () => number
  readonly onResize: (size: number) => void
  readonly onReset: () => void
  readonly className?: string
}) {
  const vertical = isVerticalEdge(edge)
  const drag = useRef<{ readonly at: number; readonly size: number; readonly max: number }>(null)
  const pointerAt = (event: PointerEvent<HTMLDivElement>) =>
    vertical ? event.clientY : event.clientX

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { at: pointerAt(event), size: measure(), max: max() }
    document.documentElement.dataset.resizing = vertical ? "row" : "column"
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start === null) return
    onResize(dragWidth(start.size, pointerAt(event) - start.at, edge, min, start.max))
  }

  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    delete document.documentElement.dataset.resizing
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { grow, shrink } = KEYS[edge]
    const size = measure()
    const next =
      event.key === grow
        ? size + KEYBOARD_STEP
        : event.key === shrink
          ? size - KEYBOARD_STEP
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? max()
              : null
    if (next === null) {
      if (event.key === "Enter") onReset()
      return
    }
    event.preventDefault()
    onResize(clampWidth(next, min, max()))
  }

  return (
    <div
      role="separator"
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={min}
      aria-valuenow={value}
      tabIndex={0}
      title={`${label}. Double-click to reset.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        // no-drag: where it crosses a title bar, the desktop app must not move the window instead.
        "absolute z-20 touch-none outline-none [app-region:no-drag]",
        "after:absolute after:transition-colors hover:after:bg-ring/60 focus-visible:after:bg-ring",
        vertical
          ? "inset-x-0 -top-1 h-2 cursor-row-resize after:inset-x-0 after:top-1/2 after:h-0.5 after:-translate-y-1/2"
          : "inset-y-0 w-2 cursor-col-resize after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2",
        edge === "end" && "-right-1",
        edge === "start" && "-left-1",
        className,
      )}
    />
  )
}
