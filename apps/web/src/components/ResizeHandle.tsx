import { cn } from "cn"
import { type KeyboardEvent, type PointerEvent, useRef } from "react"
import { clampWidth, dragWidth, KEYBOARD_STEP, type ResizeEdge } from "@/lib/resize"

/**
 * A thin vertical handle on one edge of an element, dragged (or moved with the arrow keys) to
 * change its width. Double-click resets the width to the layout's default.
 */
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
  /** The width the human set, if any, for assistive technology. */
  readonly value?: number | undefined
  readonly min: number
  /** The widest the element may be right now, which can depend on the window. */
  readonly max: () => number
  /** The element's width as it is rendered now. */
  readonly measure: () => number
  readonly onResize: (width: number) => void
  readonly onReset: () => void
  readonly className?: string
}) {
  const drag = useRef<{ readonly x: number; readonly width: number; readonly max: number }>(null)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width: measure(), max: max() }
    document.documentElement.dataset.resizing = ""
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start === null) return
    onResize(dragWidth(start.width, event.clientX - start.x, edge, min, start.max))
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
    const grow = edge === "end" ? "ArrowRight" : "ArrowLeft"
    const shrink = edge === "end" ? "ArrowLeft" : "ArrowRight"
    const width = measure()
    const next =
      event.key === grow
        ? width + KEYBOARD_STEP
        : event.key === shrink
          ? width - KEYBOARD_STEP
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
      aria-orientation="vertical"
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
        "absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none [app-region:no-drag]",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors",
        "hover:after:bg-ring/60 focus-visible:after:bg-ring",
        edge === "end" ? "-right-1" : "-left-1",
        className,
      )}
    />
  )
}
