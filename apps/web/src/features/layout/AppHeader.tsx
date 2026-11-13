import { cn } from "cn"
import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

const HeaderSlot = createContext<HTMLElement | null>(null)
const HeaderInsetEnd = createContext<(pixels: number) => void>(() => undefined)

/**
 * A blur that is strongest at the top and fades out downwards, so content
 * scrolling under the header softens instead of hitting a hard edge. Each
 * layer blurs more and is masked to a shorter band near the top.
 */
function ProgressiveBlur({ className }: { readonly className?: string }) {
  const layers = [1, 2, 4, 8, 16]
  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      {layers.map((blur, index) => {
        const start = index * 15
        const mask = `linear-gradient(to top, transparent ${start}%, black ${start + 25}%)`
        return (
          <div
            key={blur}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        )
      })}
      <div className="absolute inset-0 bg-linear-to-b from-background/80 via-background/40 to-transparent" />
    </div>
  )
}

/**
 * The header over every page of the app. It is transparent: content scrolls
 * underneath, softened by a progressive blur. Pages fill it with
 * `<AppHeader>`; pages scrolling under it leave `pt-14` of room at their top.
 * A page with a full-height panel on its right gives the header that panel's
 * width with `useAppHeaderInsetEnd`, and the header ends where it begins.
 */
export function AppHeaderHost({ children }: { readonly children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [insetEnd, setInsetEnd] = useState(0)
  const { state, isMobile } = useSidebar()
  return (
    <HeaderSlot.Provider value={slot}>
      <HeaderInsetEnd.Provider value={setInsetEnd}>{children}</HeaderInsetEnd.Provider>
      <header
        className="pointer-events-none absolute top-0 left-0 z-20"
        style={{ right: insetEnd }}
      >
        <ProgressiveBlur className="absolute inset-x-0 top-0 h-20" />
        <div className="pointer-events-auto relative flex h-12 items-center gap-2 px-3">
          {/* The toggle lives in the sidebar; it shows here only when the sidebar is hidden. */}
          {(state === "collapsed" || isMobile) && <SidebarTrigger />}
          <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-2" />
        </div>
      </header>
    </HeaderSlot.Provider>
  )
}

/**
 * Ends the app header `pixels` before the right edge, for as long as the
 * calling page stays mounted, so a panel there can run to the top.
 */
export function useAppHeaderInsetEnd(pixels: number) {
  const setInsetEnd = useContext(HeaderInsetEnd)
  useEffect(() => {
    setInsetEnd(pixels)
    return () => setInsetEnd(0)
  }, [pixels, setInsetEnd])
}

export function AppHeader({
  children,
  actions,
}: {
  readonly children: ReactNode
  readonly actions?: ReactNode
}) {
  const slot = useContext(HeaderSlot)
  if (slot === null) return null
  return createPortal(
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </>,
    slot,
  )
}
