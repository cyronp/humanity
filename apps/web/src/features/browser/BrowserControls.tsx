import { PREVIEW_DEVICES, type PreviewViewport, stepZoom, viewportSize } from "@humanity/contracts"
import { cn } from "cn"
import {
  Globe,
  Maximize,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type BrowserTab, tabLabel } from "./browser.ts"

const CATEGORIES = ["Phone", "Tablet", "Desktop"] as const

const viewportKey = (viewport: PreviewViewport) =>
  viewport._tag === "device" ? `device:${viewport.id}` : viewport._tag

/** Picks the page's size: the panel's, a free size, or a device's, with rotation. */
export function DeviceMenu({
  viewport,
  onChange,
}: {
  readonly viewport: PreviewViewport
  readonly onChange: (viewport: PreviewViewport) => void
}) {
  const device =
    viewport._tag === "device" ? PREVIEW_DEVICES.find((each) => each.id === viewport.id) : undefined
  const Icon =
    device?.category === "Phone"
      ? Smartphone
      : device?.category === "Tablet"
        ? Tablet
        : viewport._tag === "fill"
          ? Maximize
          : Monitor
  const select = (key: string) => {
    if (key === "fill") return onChange({ _tag: "fill" })
    if (key === "free") {
      const size = viewportSize(viewport) ?? { width: 1280, height: 800 }
      return onChange({ _tag: "free", ...size })
    }
    const id = key.slice("device:".length)
    onChange({ _tag: "device", id, landscape: viewport._tag === "device" && viewport.landscape })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Page size"
          title={
            device === undefined
              ? viewport._tag === "fill"
                ? "Page size: the panel's"
                : "Page size: free"
              : `Page size: ${device.label}`
          }
          className={cn(viewport._tag !== "fill" && "text-primary")}
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-56 overflow-y-auto">
        <DropdownMenuRadioGroup value={viewportKey(viewport)} onValueChange={select}>
          <DropdownMenuRadioItem value="fill">Fill the panel</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="free">Free size</DropdownMenuRadioItem>
          {CATEGORIES.map((category) => (
            <div key={category}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {category}
              </DropdownMenuLabel>
              {PREVIEW_DEVICES.filter((each) => each.category === category).map((each) => (
                <DropdownMenuRadioItem key={each.id} value={`device:${each.id}`}>
                  <span className="flex-1">{each.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {each.width}×{each.height}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          disabled={viewport._tag !== "device"}
          checked={viewport._tag === "device" && viewport.landscape}
          onCheckedChange={(landscape) =>
            viewport._tag === "device" && onChange({ ...viewport, landscape })
          }
        >
          Landscape
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Zooms the page in fixed steps; the percentage resets it. */
export function ZoomControl({
  zoom,
  onChange,
}: {
  readonly zoom: number
  readonly onChange: (zoom: number) => void
}) {
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={stepZoom(zoom, -1) === zoom}
        onClick={() => onChange(stepZoom(zoom, -1))}
      >
        <ZoomOut />
      </Button>
      <button
        type="button"
        className="w-10 rounded-md text-center text-xs text-muted-foreground tabular-nums hover:text-foreground"
        title="Reset the zoom"
        onClick={() => onChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={stepZoom(zoom, 1) === zoom}
        onClick={() => onChange(stepZoom(zoom, 1))}
      >
        <ZoomIn />
      </Button>
    </div>
  )
}

/** The Browser's tabs: a click shows one, a middle click or its × closes it, + opens a new one. */
export function TabStrip({
  tabs,
  active,
  icons,
  onSelect,
  onClose,
  onNew,
}: {
  readonly tabs: ReadonlyArray<BrowserTab>
  readonly active: string | null
  /** A favicon per tab, where the page gave one. */
  readonly icons?: ReadonlyMap<string, string> | undefined
  readonly onSelect: (id: string) => void
  readonly onClose: (id: string) => void
  readonly onNew: () => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Browser tabs"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active
        const icon = icons?.get(tab.id)
        return (
          <div
            key={tab.id}
            className={cn(
              "group/tab flex h-7 max-w-44 min-w-24 shrink items-center rounded-md text-xs",
              selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              title={tab.url ?? "New tab"}
              onClick={() => onSelect(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {icon === undefined ? (
                <Globe className="size-3.5 shrink-0" />
              ) : (
                <img src={icon} alt="" className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{tabLabel(tab)}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${tabLabel(tab)}`}
              onClick={() => onClose(tab.id)}
              className={cn(
                "mr-1 rounded-sm p-0.5 hover:bg-foreground/10",
                !selected && "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
      <Button variant="ghost" size="icon-xs" aria-label="New tab" title="New tab" onClick={onNew}>
        <Plus />
      </Button>
    </div>
  )
}
