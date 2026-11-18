import type { PreviewColorScheme } from "@humanity/contracts"
import { cn } from "cn"
import {
  ArrowLeft,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

/** Find, appearance, mute, DevTools, and a menu with the rarer actions. */
export function PageTools({
  live,
  control,
  url,
  onFind,
  onClearData,
  onOpenOutside,
}: {
  readonly live: TabLive
  readonly control: () => TabController | undefined
  readonly url: string
  readonly onFind: () => void
  readonly onClearData: () => void
  readonly onOpenOutside: () => void
}) {
  const SchemeIcon = SCHEME_ICON[live.colorScheme]
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Find in page"
        title="Find in page (Ctrl+F)"
        onClick={onFind}
      >
        <Search />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Appearance"
            title="Light or dark appearance"
            className={cn(live.colorScheme !== "system" && "text-primary")}
          >
            <SchemeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={live.muted ? "Unmute" : "Mute"}
        title={live.muted ? "Unmute" : "Mute"}
        className={cn(live.muted && "text-primary")}
        onClick={() => control()?.setMuted(!live.muted)}
      >
        {live.muted ? <VolumeX /> : <Volume2 />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="More" title="More">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
    </>
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
