import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "cn"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

const CLIP_REM = 16
const COLLAPSE_PAST = 1.25

const rootFontSize = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

export function CollapsibleText({
  children,
  reveal,
}: {
  readonly children: ReactNode
  readonly reveal: boolean
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const [expanded, setExpanded] = useState(reveal)
  const [revealed, setRevealed] = useState(reveal)
  if (reveal !== revealed) {
    setRevealed(reveal)
    if (reveal) setExpanded(true)
  }

  useLayoutEffect(() => {
    const text = textRef.current
    if (text === null) return
    const measure = () => setLong(text.offsetHeight > CLIP_REM * COLLAPSE_PAST * rootFontSize())
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(text)
    return () => observer.disconnect()
  }, [])

  const clipped = long && !expanded
  const toggle = () => {
    setExpanded(!expanded)
    if (expanded) frameRef.current?.scrollIntoView({ block: "nearest" })
  }

  return (
    <div ref={frameRef}>
      <div
        className={cn(clipped && "overflow-hidden mask-b-from-60%")}
        style={clipped ? { maxHeight: `${CLIP_REM}rem` } : undefined}
      >
        <div ref={textRef}>{children}</div>
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={toggle}
          className="mt-1 flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
