import { useAtomValue } from "@effect/atom-react"
import {
  DEFAULT_BROWSER_PREFERENCES,
  type TerminalOwner,
  terminalOwnerKey,
} from "@humanity/contracts"
import { cn } from "cn"
import { AsyncResult } from "effect/reactivity"
import { PanelBottom, PanelRight } from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import { ResizeHandle } from "@/components/ResizeHandle"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { browserPreferencesAtom } from "@/features/browser/atoms"
import {
  browserDefaultsOf,
  onPreviewOpen,
  setBrowserDefaults,
  setLinkTarget,
} from "@/features/browser/browser"
import { useAppHeaderInsetEnd } from "@/features/layout/AppHeader"
import { IdleToolRail, RAIL_WIDTH } from "@/features/session/panel/SessionPanel"
import {
  readStoredShelf,
  type ShelfState,
  type ShelfTool,
  storeShelf,
  toggleTool,
} from "@/features/session/panel/shelf"
import {
  CHAT_MIN_HEIGHT,
  DOCK_HEIGHT_KEY,
  DOCK_MIN_HEIGHT,
  DOCK_OPEN_KEY,
  RAIL_SHOWN_KEY,
  useStoredFlag,
} from "@/features/terminal/dock"
import { terminalsAtom } from "@/features/terminal/atoms"
import { isMac, shortcutLabel, terminalCommand } from "@/features/terminal/keys"
import { onShowTerminal, type ShowTerminalRequest } from "@/features/terminal/showTerminal"
import { type DockCommands, TerminalDock } from "@/features/terminal/TerminalDock"
import { useStoredWidth } from "@/lib/resize"

const PANEL_MIN_WIDTH = 320
const CHAT_MIN_WIDTH = 360

export interface PanelProps {
  readonly tool: ShelfTool
  readonly onClose: () => void
}

export function WorkspaceFrame({
  terminals,
  header,
  rail,
  panel,
  children,
}: {
  readonly terminals:
    { readonly owner: TerminalOwner; readonly unavailable?: string | undefined } | undefined
  readonly header: (actions: ReactNode) => ReactNode
  readonly rail?:
    ((shelf: ShelfState, onSelect: (tool: ShelfTool) => void) => ReactNode) | undefined
  readonly panel?: ((props: PanelProps) => ReactNode) | undefined
  readonly children: ReactNode
}) {
  const [shelf, setShelfState] = useState<ShelfState>(() =>
    readStoredShelf(window.matchMedia("(min-width: 1024px)").matches),
  )
  const setShelf = (next: ShelfState) => {
    setShelfState(next)
    storeShelf(next)
  }
  const [railShown, setRailShown] = useStoredFlag(RAIL_SHOWN_KEY, true)
  const panelOpen = shelf.open && railShown && panel !== undefined
  const [terminalsOpen, setTerminalsOpen] = useStoredFlag(DOCK_OPEN_KEY, false)
  const [terminalHeight, setTerminalHeight] = useStoredWidth(DOCK_HEIGHT_KEY)
  const terminalArea = useRef<HTMLDivElement>(null)
  const dockCommands = useRef<DockCommands | null>(null)
  const [newTerminalRequest, setNewTerminalRequest] = useState(0)
  const [showRequest, setShowRequest] = useState<ShowTerminalRequest>()

  useEffect(
    () =>
      onShowTerminal((request) => {
        setTerminalsOpen(true)
        setShowRequest(request)
      }),
    [setTerminalsOpen],
  )

  const browserPreferences = useAtomValue(browserPreferencesAtom)
  const { linkTarget, device, zoom, appearance } = AsyncResult.isSuccess(browserPreferences)
    ? browserPreferences.value
    : DEFAULT_BROWSER_PREFERENCES
  useEffect(() => setLinkTarget(linkTarget), [linkTarget])
  useEffect(
    () => setBrowserDefaults(browserDefaultsOf({ device, zoom, appearance })),
    [device, zoom, appearance],
  )

  const hasPanel = panel !== undefined
  useEffect(() => {
    if (!hasPanel) return
    return onPreviewOpen(() => {
      setRailShown(true)
      setShelfState((current) => {
        const next = { open: true, tool: "browser" as const }
        storeShelf(next)
        return current.open && current.tool === "browser" ? current : next
      })
    })
  }, [hasPanel, setRailShown])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = terminalCommand(event, { mac: isMac(), hasSelection: false })
      if (command === "toggle-dock") {
        event.preventDefault()
        setTerminalsOpen(!terminalsOpen)
      } else if (command === "new-terminal") {
        event.preventDefault()
        if (terminalsOpen) setNewTerminalRequest((request) => request + 1)
        else setTerminalsOpen(true)
      } else if (
        (command === "next-terminal" || command === "previous-terminal") &&
        event.target instanceof Element &&
        event.target.closest("[data-terminal-dock]") !== null
      ) {
        event.preventDefault()
        dockCommands.current?.cycle(command === "next-terminal" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [terminalsOpen, setTerminalsOpen])

  const [chat, setChat] = useState<HTMLDivElement | null>(null)
  const [chatWidth, setChatWidth] = useState<number | null>(null)
  const [rowWidth, setRowWidth] = useState(0)
  useEffect(() => {
    const row = chat?.parentElement
    if (chat === null || row === null || row === undefined) return
    const observer = new ResizeObserver(() => {
      setChatWidth(chat.offsetWidth)
      setRowWidth(row.clientWidth)
    })
    observer.observe(chat)
    observer.observe(row)
    return () => observer.disconnect()
  }, [chat])
  const chatShown = chatWidth === null || chatWidth > 0
  const [panelWidth, setPanelWidth] = useStoredWidth("humanity.panelWidth")
  const panelElement = useRef<HTMLElement>(null)
  useAppHeaderInsetEnd(
    chatShown && chatWidth !== null ? rowWidth - chatWidth : railShown ? RAIL_WIDTH : 0,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header(
        <LayoutButtons
          terminalsOwner={terminals?.owner}
          terminalsOpen={terminalsOpen}
          railShown={railShown}
          onToggleTerminals={() => setTerminalsOpen(!terminalsOpen)}
          onToggleRail={() => setRailShown(!railShown)}
        />,
      )}
      <div className="flex min-h-0 flex-1">
        <div
          ref={setChat}
          className={cn("flex min-w-0 flex-1 flex-col", panelOpen && "hidden lg:flex")}
        >
          {children}
          {terminalsOpen && terminals !== undefined && (
            <div
              ref={terminalArea}
              className={cn("relative shrink-0", terminalHeight === null && "h-[40%]")}
              style={terminalHeight === null ? undefined : { height: terminalHeight }}
            >
              <ResizeHandle
                edge="top"
                label="Resize the terminals"
                value={terminalHeight ?? undefined}
                min={DOCK_MIN_HEIGHT}
                max={() => (chat?.offsetHeight ?? 0) - CHAT_MIN_HEIGHT}
                measure={() => terminalArea.current?.offsetHeight ?? DOCK_MIN_HEIGHT}
                onResize={setTerminalHeight}
                onReset={() => setTerminalHeight(null)}
              />
              <TerminalDock
                key={terminalOwnerKey(terminals.owner)}
                owner={terminals.owner}
                unavailable={terminals.unavailable}
                commandsRef={dockCommands}
                newTerminalRequest={newTerminalRequest}
                showRequest={showRequest}
                onHide={() => setTerminalsOpen(false)}
              />
            </div>
          )}
        </div>
        {panelOpen && (
          <aside
            ref={panelElement}
            className={cn(
              "relative flex min-h-0 min-w-0 flex-1 flex-col border-l lg:min-w-80 lg:flex-none",
              panelWidth === null
                ? "lg:w-[55%] lg:max-w-4xl"
                : "lg:w-(--panel-width) lg:max-w-[calc(100%-25.5rem)]",
              !chatShown && "pt-12",
            )}
            style={
              panelWidth === null
                ? undefined
                : ({ "--panel-width": `${panelWidth}px` } as CSSProperties)
            }
          >
            {chatShown && (
              <ResizeHandle
                edge="start"
                label="Resize the panel"
                value={panelWidth ?? undefined}
                min={PANEL_MIN_WIDTH}
                max={() => rowWidth - RAIL_WIDTH - CHAT_MIN_WIDTH}
                measure={() => panelElement.current?.offsetWidth ?? PANEL_MIN_WIDTH}
                onResize={setPanelWidth}
                onReset={() => setPanelWidth(null)}
              />
            )}
            {panel({
              tool: shelf.tool,
              onClose: () => setShelf({ ...shelf, open: false }),
            })}
          </aside>
        )}
        {railShown &&
          (rail === undefined ? (
            <IdleToolRail />
          ) : (
            rail(shelf, (tool) => setShelf(toggleTool(shelf, tool)))
          ))}
      </div>
    </div>
  )
}

function BusyBadge({ owner }: { readonly owner: TerminalOwner }) {
  const result = useAtomValue(terminalsAtom(JSON.stringify(owner)))
  const busy = AsyncResult.isSuccess(result)
    ? result.value.filter((terminal) => terminal.busy === true).length
    : 0
  if (busy === 0) return null
  return (
    <span
      aria-label={busy === 1 ? "A command runs" : `${busy} commands run`}
      className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-0.5 text-[9px] leading-none font-medium text-white tabular-nums"
    >
      {busy}
    </span>
  )
}

function LayoutButtons({
  terminalsOwner,
  terminalsOpen,
  railShown,
  onToggleTerminals,
  onToggleRail,
}: {
  readonly terminalsOwner: TerminalOwner | undefined
  readonly terminalsOpen: boolean
  readonly railShown: boolean
  readonly onToggleTerminals: () => void
  readonly onToggleRail: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Terminal"
            aria-pressed={terminalsOpen}
            onClick={onToggleTerminals}
            className={cn("relative", !terminalsOpen && "text-muted-foreground")}
          >
            <PanelBottom />
            {terminalsOwner !== undefined && <BusyBadge owner={terminalsOwner} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {`${terminalsOpen ? "Hide" : "Show"} the terminal (${shortcutLabel("Ctrl+`")})`}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Tools"
            aria-pressed={railShown}
            onClick={onToggleRail}
            className={cn(!railShown && "text-muted-foreground")}
          >
            <PanelRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{`${railShown ? "Hide" : "Show"} the tools`}</TooltipContent>
      </Tooltip>
    </div>
  )
}
