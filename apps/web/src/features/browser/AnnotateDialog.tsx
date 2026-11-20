import { cn } from "cn"
import { ArrowUpRight, Pencil, RectangleHorizontal, Trash2, Type, Undo2 } from "lucide-react"
import { type PointerEvent, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Tool = "pen" | "arrow" | "box" | "text"

interface Point {
  readonly x: number
  readonly y: number
}

export type Mark =
  | { readonly kind: "pen"; readonly color: string; readonly points: ReadonlyArray<Point> }
  | {
      readonly kind: "arrow" | "box"
      readonly color: string
      readonly from: Point
      readonly to: Point
    }
  | { readonly kind: "text"; readonly color: string; readonly at: Point; readonly text: string }

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#ffffff", "#111827"] as const

export const drawMarks = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  marks: ReadonlyArray<Mark>,
  width: number,
) => {
  context.drawImage(image, 0, 0)
  const line = Math.max(3, Math.round(width / 300))
  context.lineCap = "round"
  context.lineJoin = "round"
  for (const mark of marks) {
    context.strokeStyle = mark.color
    context.fillStyle = mark.color
    context.lineWidth = line
    switch (mark.kind) {
      case "pen": {
        context.beginPath()
        mark.points.forEach((point, index) =>
          index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
        )
        context.stroke()
        break
      }
      case "box":
        context.strokeRect(
          mark.from.x,
          mark.from.y,
          mark.to.x - mark.from.x,
          mark.to.y - mark.from.y,
        )
        break
      case "arrow": {
        const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x)
        const head = line * 5
        context.beginPath()
        context.moveTo(mark.from.x, mark.from.y)
        context.lineTo(mark.to.x, mark.to.y)
        context.stroke()
        context.beginPath()
        context.moveTo(mark.to.x, mark.to.y)
        context.lineTo(
          mark.to.x - head * Math.cos(angle - Math.PI / 7),
          mark.to.y - head * Math.sin(angle - Math.PI / 7),
        )
        context.lineTo(
          mark.to.x - head * Math.cos(angle + Math.PI / 7),
          mark.to.y - head * Math.sin(angle + Math.PI / 7),
        )
        context.closePath()
        context.fill()
        break
      }
      case "text": {
        const size = line * 7
        context.font = `600 ${size}px system-ui, sans-serif`
        context.lineWidth = line
        context.strokeStyle = mark.color === "#111827" ? "#ffffff" : "#111827"
        context.strokeText(mark.text, mark.at.x, mark.at.y)
        context.fillText(mark.text, mark.at.x, mark.at.y)
        break
      }
    }
  }
}

export function AnnotateDialog({
  image,
  onAttach,
  onClose,
}: {
  readonly image: string | undefined
  readonly onAttach: (file: File) => void
  readonly onClose: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [bitmap, setBitmap] = useState<HTMLImageElement>()
  const [marks, setMarks] = useState<ReadonlyArray<Mark>>([])
  const [drawing, setDrawing] = useState<Mark>()
  const stroke = useRef<Mark | undefined>(undefined)
  const [tool, setTool] = useState<Tool>("arrow")
  const [color, setColor] = useState<string>(COLORS[0])
  const [typing, setTyping] = useState<{ at: Point; screen: Point; text: string }>()

  useEffect(() => {
    if (image === undefined) return
    const element = new Image()
    element.onload = () => setBitmap(element)
    element.src = image
  }, [image])

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext("2d")
    if (element === null || context == null || bitmap === undefined) return
    element.width = bitmap.naturalWidth
    element.height = bitmap.naturalHeight
    drawMarks(
      context,
      bitmap,
      drawing === undefined ? marks : [...marks, drawing],
      bitmap.naturalWidth,
    )
  }, [bitmap, marks, drawing])

  const pointOf = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    const scale = event.currentTarget.width / box.width
    return { x: (event.clientX - box.left) * scale, y: (event.clientY - box.top) * scale }
  }

  const commitText = () => {
    if (typing !== undefined && typing.text.trim() !== "") {
      setMarks((current) => [...current, { kind: "text", color, at: typing.at, text: typing.text }])
    }
    setTyping(undefined)
  }

  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    const at = pointOf(event)
    if (tool === "text") {
      commitText()
      const box = event.currentTarget.getBoundingClientRect()
      setTyping({
        at,
        screen: { x: event.clientX - box.left, y: event.clientY - box.top },
        text: "",
      })
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {}
    stroke.current =
      tool === "pen"
        ? { kind: "pen", color, points: [at] }
        : { kind: tool, color, from: at, to: at }
    setDrawing(stroke.current)
  }
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = stroke.current
    if (current === undefined) return
    const at = pointOf(event)
    stroke.current =
      current.kind === "pen"
        ? { ...current, points: [...current.points, at] }
        : current.kind === "text"
          ? current
          : { ...current, to: at }
    setDrawing(stroke.current)
  }
  const up = () => {
    const done = stroke.current
    stroke.current = undefined
    if (done !== undefined) setMarks((current) => [...current, done])
    setDrawing(undefined)
  }

  const attach = () => {
    commitText()
    const element = canvas.current
    if (element === null || bitmap === undefined) return
    const context = element.getContext("2d")
    if (context === null) return
    const final =
      typing !== undefined && typing.text.trim() !== ""
        ? [...marks, { kind: "text" as const, color, at: typing.at, text: typing.text }]
        : marks
    drawMarks(context, bitmap, final, bitmap.naturalWidth)
    element.toBlob((blob) => {
      if (blob === null) return
      onAttach(new File([blob], "annotated-screenshot.png", { type: "image/png" }))
      onClose()
    }, "image/png")
  }

  return (
    <Dialog open={image !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(92vw,1200px)] max-w-none flex-col gap-3 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Annotate the screenshot</DialogTitle>
          <DialogDescription>Draw on the page, then add it to your message.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={(value) => value !== "" && setTool(value as Tool)}
          >
            <ToggleGroupItem value="arrow" aria-label="Arrow" title="Arrow">
              <ArrowUpRight />
            </ToggleGroupItem>
            <ToggleGroupItem value="box" aria-label="Box" title="Box">
              <RectangleHorizontal />
            </ToggleGroupItem>
            <ToggleGroupItem value="pen" aria-label="Pen" title="Pen">
              <Pencil />
            </ToggleGroupItem>
            <ToggleGroupItem value="text" aria-label="Text" title="Text">
              <Type />
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
            {COLORS.map((each) => (
              <button
                key={each}
                type="button"
                role="radio"
                aria-checked={each === color}
                aria-label={each}
                onClick={() => setColor(each)}
                className={cn(
                  "size-5 rounded-full ring-1 ring-border",
                  each === color && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
                style={{ background: each }}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={marks.length === 0}
              onClick={() => setMarks((current) => current.slice(0, -1))}
            >
              <Undo2 />
              Undo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={marks.length === 0}
              onClick={() => setMarks([])}
            >
              <Trash2 />
              Clear
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
          <canvas
            ref={canvas}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className={cn("block max-w-full", tool === "text" ? "cursor-text" : "cursor-crosshair")}
          />
          {typing !== undefined && (
            <input
              autoFocus
              value={typing.text}
              onChange={(event) => setTyping({ ...typing, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitText()
                if (event.key === "Escape") {
                  event.stopPropagation()
                  setTyping(undefined)
                }
              }}
              onBlur={commitText}
              placeholder="Type, then Enter"
              className="absolute rounded border bg-background px-1 text-sm outline-none"
              style={{ left: typing.screen.x, top: typing.screen.y - 14, color }}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={attach} disabled={bitmap === undefined}>
            Add to message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
