import type { PreviewColorScheme } from "@humanity/contracts"
import {
  ArrowLeft,
  Camera,
  Crosshair,
  PenLine,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Code,
  Ellipsis,
  ExternalLink,
  Eraser,
  Moon,
  RotateCw,
  Search,
  Sun,
  SunMoon,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ZoomControl } from "./BrowserControls.tsx"
import { Input } from "@/components/ui/input"
import type { TabController, TabLive } from "./WebviewTab.tsx"

/** Back, forward, and reload (Shift: ignoring the cache) or stop while the page loads. */
export function NavigationButtons({
  live,
  control,
}: {
  readonly live: TabLive
  readonly control: () => TabController | undefined
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Back"
        title="Back"
        disabled={!live.canGoBack}
        onClick={() => control()?.back()}
      >
        <ArrowLeft />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Forward"
        title="Forward"
        disabled={!live.canGoForward}
        onClick={() => control()?.forward()}
      >
        <ArrowRight />
      </Button>
      {live.loading ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Stop"
          title="Stop"
          onClick={() => control()?.stop()}
        >
          <X />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Reload"
          title="Reload (Shift: ignore the cache)"
          onClick={(event) => control()?.reload(event.shiftKey)}
        >
          <RotateCw />
        </Button>
      )}
    </>
  )
}

const SCHEME_ICON = { system: SunMoon, light: Sun, dark: Moon } as const

/**
 * The page's rarer tools in one menu, so the address bar keeps its room: zoom, find, appearance,
 * mute, DevTools, a reload that skips the cache, the human's browser, and clearing the Browser's
 * data.
 */
export function PageTools({
  live,
  control,
  url,
  zoom,
  onZoom,
  onFind,
  onClearData,
  onOpenOutside,
}: {
  readonly live: TabLive
  readonly control: () => TabController | undefined
  readonly url: string
  readonly zoom: number
  readonly onZoom: (zoom: number) => void
  readonly onFind: () => void
  readonly onClearData: () => void
  readonly onOpenOutside: () => void
}) {
  const SchemeIcon = SCHEME_ICON[live.colorScheme]
  const changed = live.colorScheme !== "system" || live.muted || zoom !== 1
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="More"
          title="Zoom, find, appearance, DevTools and more"
          className="relative"
        >
          <Ellipsis />
          {changed && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-1 px-2 py-1 text-sm">
          <span className="flex-1">Zoom</span>
          <ZoomControl zoom={zoom} onChange={onZoom} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onFind}>
          <Search />
          Find in page
          <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SchemeIcon />
            Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              prefers-color-scheme
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={live.colorScheme}
              onValueChange={(value) => control()?.setColorScheme(value as PreviewColorScheme)}
            >
              <DropdownMenuRadioItem value="system">Like the system</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => control()?.setMuted(!live.muted)}>
          {live.muted ? <VolumeX /> : <Volume2 />}
          {live.muted ? "Unmute" : "Mute"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => control()?.devTools()}>
          <Code />
          Open DevTools
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => control()?.reload(true)}>
          <RotateCw />
          Reload, ignoring the cache
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenOutside} title={url}>
          <ExternalLink />
          Open in my browser
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onClearData}>
          <Eraser />
          Clear cookies and cache
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Find in the page: Enter for the next match, Shift+Enter for the previous one, Esc to close. */
export function FindBar({
  live,
  control,
  onClose,
}: {
  readonly live: TabLive
  readonly control: () => TabController | undefined
  readonly onClose: () => void
}) {
  const [text, setText] = useState("")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const close = () => {
    control()?.stopFind()
    onClose()
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <Input
        ref={input}
        value={text}
        placeholder="Find in page"
        aria-label="Find in page"
        className="h-7 max-w-64 text-xs md:text-xs"
        onChange={(event) => {
          setText(event.target.value)
          control()?.find(event.target.value, { forward: true, next: false })
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close()
          if (event.key === "Enter") {
            event.preventDefault()
            control()?.find(text, { forward: !event.shiftKey, next: true })
          }
        }}
      />
      <span className="w-16 text-xs text-muted-foreground tabular-nums">
        {live.found === undefined || text === ""
          ? ""
          : live.found.matches === 0
            ? "No matches"
            : `${live.found.active} of ${live.found.matches}`}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous match"
        onClick={() => control()?.find(text, { forward: false, next: true })}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next match"
        onClick={() => control()?.find(text, { forward: true, next: true })}
      >
        <ChevronDown />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Close find" onClick={close}>
        <X />
      </Button>
    </div>
  )
}

/** Picks an element, or takes a screenshot (to attach, or to annotate first), for the message. */
export function CaptureTools({
  picking,
  busy,
  onPick,
  onScreenshot,
  onAnnotate,
}: {
  readonly picking: boolean
  readonly busy: boolean
  readonly onPick: () => void
  readonly onScreenshot: () => void
  readonly onAnnotate: () => void
}) {
  return (
    <>
      <Button
        type="button"
        variant={picking ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label={picking ? "Stop picking" : "Pick an element"}
        aria-pressed={picking}
        title={picking ? "Stop picking (Esc in the page)" : "Pick an element for your message"}
        onClick={onPick}
      >
        <Crosshair />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Screenshot"
        title="Add a screenshot to your message"
        disabled={busy}
        onClick={onScreenshot}
      >
        <Camera />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Annotate a screenshot"
        title="Draw on a screenshot, then add it to your message"
        disabled={busy}
        onClick={onAnnotate}
      >
        <PenLine />
      </Button>
    </>
  )
}
