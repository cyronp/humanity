import {
  fitViewport,
  freeViewport,
  PREVIEW_DEVICES,
  type PreviewViewport,
  viewportSize,
} from "@humanity/contracts"
import { cn } from "cn"
import { RotateCcwSquare } from "lucide-react"
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const PADDING = 16
const READOUT = 28

type Edge = "right" | "bottom" | "corner"

/**
 * Shows a page at its tab's size: the whole area when it fills the panel, else a frame of the
 * device's or a free size, centred and scaled down to fit, with handles that drag it to a free
 * size. Zoom scales what the page draws, as a browser's zoom does.
 */
export function ViewportFrame({
  viewport,
  zoom,
  onViewportChange,
  children,
}: {
  readonly viewport: PreviewViewport
  readonly zoom: number
  readonly onViewportChange: (viewport: PreviewViewport) => void
  /**
   * The page. A frame is drawn scaled with a CSS transform; a function child (a `<webview>`, which
   * draws unscaled whatever its box's transform) gets the box at the shown size and the scale to
   * zoom the page by instead.
   */
  readonly children: ReactNode | ((scale: number) => ReactNode)
}) {
  const area = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = area.current
    if (element === null) return
    const observer = new ResizeObserver(() =>
      setBox({ width: element.clientWidth, height: element.clientHeight }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const size = viewportSize(viewport)
  const available =
    size === undefined
      ? box
      : {
          width: Math.max(1, box.width - PADDING * 2),
          height: Math.max(1, box.height - PADDING * 2 - READOUT),
        }
  const frame = fitViewport(size, available, zoom)
  const shownWidth = frame.width * frame.scale
  const shownHeight = frame.height * frame.scale

  const drag = (edge: Edge) => (event: PointerEvent<HTMLDivElement>) => {
    if (size === undefined) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const start = { x: event.clientX, y: event.clientY, ...size }
    const perPixel = zoom / frame.scale
    document.documentElement.dataset.resizing = edge === "bottom" ? "row" : "column"
    const move = (moved: globalThis.PointerEvent) => {
      const width =
        edge === "bottom" ? start.width : start.width + (moved.clientX - start.x) * 2 * perPixel
      const height =
        edge === "right" ? start.height : start.height + (moved.clientY - start.y) * perPixel
      onViewportChange(freeViewport(width, height))
    }
    const end = () => {
      delete document.documentElement.dataset.resizing
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }

  const device =
    viewport._tag === "device" ? PREVIEW_DEVICES.find((each) => each.id === viewport.id) : undefined

  return (
    <div
      ref={area}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        size !== undefined && "items-center bg-muted/40",
      )}
      style={size === undefined ? undefined : { padding: PADDING }}
    >
      {size !== undefined && (
        <div
          className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums"
          style={{ height: READOUT }}
        >
          <span>
            {device?.label ?? "Free size"} · {size.width} × {size.height}
            {frame.scale / zoom < 0.999 &&
              ` · shown at ${Math.round((frame.scale / zoom) * 100)} %`}
          </span>
          {viewport._tag === "device" && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Rotate"
              title="Rotate"
              onClick={() => onViewportChange({ ...viewport, landscape: !viewport.landscape })}
            >
              <RotateCcwSquare />
            </Button>
          )}
        </div>
      )}
      <div
        className={cn(
          "relative shrink-0",
          size !== undefined && "rounded-sm shadow-md ring-1 ring-border",
        )}
        style={{ width: shownWidth, height: shownHeight }}
      >
        {typeof children === "function" ? (
          <div className="absolute inset-0">{children(frame.scale)}</div>
        ) : (
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: frame.width,
              height: frame.height,
              transform: frame.scale === 1 ? undefined : `scale(${frame.scale})`,
            }}
          >
            {children}
          </div>
        )}
        {size !== undefined && (
          <>
            <div
              aria-hidden="true"
              onPointerDown={drag("right")}
              className="absolute top-0 -right-3 h-full w-3 cursor-col-resize"
            />
            <div
              aria-hidden="true"
              onPointerDown={drag("bottom")}
              className="absolute -bottom-3 left-0 h-3 w-full cursor-row-resize"
            />
            <div
              aria-hidden="true"
              onPointerDown={drag("corner")}
              className="absolute -right-3 -bottom-3 size-4 cursor-nwse-resize rounded-sm bg-border"
            />
          </>
        )}
      </div>
    </div>
  )
}
