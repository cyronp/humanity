import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

const COLORS = ["#3b82f6", "#60a5fa", "#f59e0b", "#10b981", "#ef4444", "#a855f7"]
const PIECES = 160
const GRAVITY = 0.25
const DRAG = 0.985
const MAX_MS = 6000

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  angle: number
  spin: number
  color: string
}

const makePiece = (index: number, width: number, height: number): Piece => {
  const fromLeft = index % 2 === 0
  const direction = (Math.PI / 180) * (50 + Math.random() * 30)
  const speed = (0.012 + Math.random() * 0.012) * Math.max(width, height) + 6
  return {
    x: fromLeft ? 0 : width,
    y: height,
    vx: Math.cos(direction) * speed * (fromLeft ? 1 : -1),
    vy: -Math.sin(direction) * speed,
    size: 6 + Math.random() * 6,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.4,
    color: COLORS[index % COLORS.length] ?? "#3b82f6",
  }
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function Confetti({ onDone }: { readonly onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext("2d")
    if (canvas === null || context === null || context === undefined) return

    const width = window.innerWidth
    const height = window.innerHeight
    const ratio = window.devicePixelRatio
    canvas.width = width * ratio
    canvas.height = height * ratio
    context.scale(ratio, ratio)

    let pieces = Array.from({ length: PIECES }, (_, index) => makePiece(index, width, height))
    const started = performance.now()
    let frame = 0

    const draw = (now: number) => {
      context.clearRect(0, 0, width, height)
      for (const piece of pieces) {
        piece.vx *= DRAG
        piece.vy = piece.vy * DRAG + GRAVITY
        piece.x += piece.vx
        piece.y += piece.vy
        piece.angle += piece.spin
        context.save()
        context.translate(piece.x, piece.y)
        context.rotate(piece.angle)
        context.fillStyle = piece.color
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
        context.restore()
      }
      pieces = pieces.filter((piece) => piece.y < height + 20)
      if (pieces.length === 0 || now - started > MAX_MS) onDone()
      else frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [onDone])

  return createPortal(
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-100 size-full"
    />,
    document.body,
  )
}
