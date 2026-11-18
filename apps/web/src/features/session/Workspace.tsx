import { acceptsMessages, parseQuestions, type Project, QUESTION_TOOL } from "@humanity/contracts"
import { cn } from "cn"
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { ResizeHandle } from "@/components/ResizeHandle"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAppHeaderInsetEnd } from "@/features/layout/AppHeader"
import { useStoredWidth } from "@/lib/resize"
import { Composer, type ComposerHandle } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { QuestionPanel } from "@/features/questions/QuestionPanel"
import { ChangeCards } from "@/features/review/ChangeCards"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  CHAT_MIN_HEIGHT,
  DOCK_HEIGHT_KEY,
  DOCK_MIN_HEIGHT,
  DOCK_OPEN_KEY,
  RAIL_SHOWN_KEY,
  useStoredFlag,
} from "@/features/terminal/dock"
import { isMac, shortcutLabel, terminalCommand } from "@/features/terminal/keys"
import { type DockCommands, TerminalDock } from "@/features/terminal/TerminalDock"
import { PanelBottom, PanelRight } from "lucide-react"
import { RAIL_WIDTH, ToolPanel, ToolRail } from "./panel/SessionPanel.tsx"
import { readStoredShelf, type ShelfState, storeShelf, toggleTool } from "./panel/shelf.ts"
import { SessionHeader } from "./SessionHeader.tsx"
import {
  approvalsByToolUse,
  isBusy,
  pendingChanges,
  pendingConfirmations,
  type SessionView,
} from "./state.ts"
import { UsageMeters } from "./UsageMeters.tsx"
import { useTranscript } from "./useTranscript.ts"

const PANEL_MIN_WIDTH = 320
/** The chat keeps at least this much room beside an open panel. */
const CHAT_MIN_WIDTH = 360

export interface WorkspaceSearch {
  readonly file?: string | undefined
}

export function Workspace({
  project,
  view,
  search,
}: {
  readonly project: Project
  readonly view: SessionView
  readonly search: WorkspaceSearch
}) {
  const { session, approvals } = view
  const changes = useMemo(() => pendingChanges(approvals), [approvals])
  const confirmations = useMemo(() => pendingConfirmations(approvals), [approvals])
  const byToolUse = useMemo(() => approvalsByToolUse(approvals), [approvals])
  const transcript = useTranscript(view)
  const waiting = changes.length + confirmations.length
  const asked = confirmations.find((confirmation) => confirmation.toolName === QUESTION_TOOL)
  const questions = asked === undefined ? undefined : parseQuestions(asked.input)
  const cards =
    questions === undefined ? confirmations : confirmations.filter((each) => each !== asked)
  const [shelf, setShelfState] = useState<ShelfState>(() =>
    readStoredShelf(window.matchMedia("(min-width: 1024px)").matches),
  )
  const setShelf = (next: ShelfState) => {
    setShelfState(next)
    storeShelf(next)
  }
  const [railShown, setRailShown] = useStoredFlag(RAIL_SHOWN_KEY, true)
  const panelOpen = shelf.open && railShown
  const [terminalsOpen, setTerminalsOpen] = useStoredFlag(DOCK_OPEN_KEY, false)
  const [terminalHeight, setTerminalHeight] = useStoredWidth(DOCK_HEIGHT_KEY)
  const terminalArea = useRef<HTMLDivElement>(null)
  const dockCommands = useRef<DockCommands | null>(null)
  const [newTerminalRequest, setNewTerminalRequest] = useState(0)

  // Ctrl+` shows or hides the terminals, Ctrl+Shift+` opens one more, Ctrl+PageUp/PageDown move
  // between them: from anywhere in the thread, terminals included (they let these keys through).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = terminalCommand(event, { mac: isMac(), hasSelection: false })
      if (command === "toggle-dock") {
        event.preventDefault()
        setTerminalsOpen(!terminalsOpen)
      } else if (command === "new-terminal") {
        event.preventDefault()
        // A closed dock opens on the thread's terminals (or a first one); an open one adds one.
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

  const activity = Object.keys(view.toolCalls).length + view.approvals.length
  const composer = useRef<ComposerHandle>(null)
  const canReference = acceptsMessages(session) && questions === undefined

  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  useEffect(() => {
    if (dock === null) return
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

  // The header runs over the chat only: the panel and the rail have their own space, full height.
  // On a narrow window the open panel takes the chat's place, under the header.
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
  const panel = useRef<HTMLElement>(null)
  useAppHeaderInsetEnd(
    chatShown && chatWidth !== null ? rowWidth - chatWidth : railShown ? RAIL_WIDTH : 0,
  )

  useEffect(() => {
    const previous = document.title
    document.title =
      waiting > 0
        ? `(${waiting}) Waiting for you · ${session.title}`
        : `${session.title} · Humanity`
    return () => {
      document.title = previous
    }
  }, [waiting, session.title])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHeader
        project={project}
        session={session}
        actions={
          <LayoutButtons
            terminalsOpen={terminalsOpen}
            railShown={railShown}
            onToggleTerminals={() => setTerminalsOpen(!terminalsOpen)}
            onToggleRail={() => setRailShown(!railShown)}
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        <div
          ref={setChat}
          className={cn("flex min-w-0 flex-1 flex-col", panelOpen && "hidden lg:flex")}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <MessageList
                bottomInset={dockHeight}
                messages={transcript.messages}
                toolCalls={transcript.toolCalls}
                draft={view.draft}
                working={session.status === "running"}
                approvals={byToolUse}
                worktreePath={session.worktreePath}
                empty={
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No messages yet.
                  </p>
                }
                earlier={
                  transcript.hasEarlier ? (
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={transcript.loading}
                        onClick={() => void transcript.loadEarlier()}
                      >
                        {transcript.loading && <Spinner />}
                        Show earlier messages
                      </Button>
                      {transcript.error !== undefined && (
                        <p className="text-xs text-destructive">{transcript.error}</p>
                      )}
                    </div>
                  ) : undefined
                }
                footer={
                  view.error !== null ? (
                    <ErrorNote title="The agent stopped" message={view.error} />
                  ) : undefined
                }
              />
            </div>
            <div
              ref={setDock}
              className="pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[calc(100%-3.5rem)] flex-col"
            >
              {(cards.length > 0 || changes.length > 0) && (
                <div className="min-h-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto">
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4 *:pointer-events-auto">
                    {cards.map((confirmation) => (
                      <div key={confirmation.id} className="rounded-lg bg-background">
                        <ConfirmationCard confirmation={confirmation} />
                      </div>
                    ))}
                    <ChangeCards changes={changes} file={search.file} />
                  </div>
                </div>
              )}
              {/* The @ menu opens upward from the chat box: while it is open nothing may clip it. */}
              <div className="max-h-[calc(100svh-3.5rem)] shrink-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto has-[[data-slot=file-mention-menu]]:overflow-visible">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 *:pointer-events-auto">
                  <UsageMeters sessionId={session.id} usage={view.usage} />
                  {asked !== undefined && questions !== undefined ? (
                    <QuestionPanel key={asked.id} confirmation={asked} questions={questions} />
                  ) : (
                    <Composer
                      ref={composer}
                      sessionId={session.id}
                      projectId={session.projectId}
                      autonomy={session.autonomy}
                      provider={session.provider}
                      model={session.model}
                      effort={session.effort}
                      disabled={!acceptsMessages(session)}
                      busy={isBusy(session.status)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          {terminalsOpen && (
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
                key={session.id}
                session={session}
                commandsRef={dockCommands}
                newTerminalRequest={newTerminalRequest}
                onHide={() => setTerminalsOpen(false)}
              />
            </div>
          )}
        </div>
        {panelOpen && (
          <aside
            ref={panel}
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
                measure={() => panel.current?.offsetWidth ?? PANEL_MIN_WIDTH}
                onResize={setPanelWidth}
                onReset={() => setPanelWidth(null)}
              />
            )}
            <ToolPanel
              session={session}
              activity={activity}
              tool={shelf.tool}
              onToolChange={(tool) => setShelf({ open: true, tool })}
              onClose={() => setShelf({ ...shelf, open: false })}
              onReference={
                canReference
                  ? (reference) => composer.current?.insert({ kind: "reference", reference })
                  : undefined
              }
            />
          </aside>
        )}
        {railShown && (
          <ToolRail
            session={session}
            shelf={shelf}
            onSelect={(tool) => setShelf(toggleTool(shelf, tool))}
          />
        )}
      </div>
    </div>
  )
}

/** The two buttons always at the top right of a thread: the terminals, and the tools' rail. */
function LayoutButtons({
  terminalsOpen,
  railShown,
  onToggleTerminals,
  onToggleRail,
}: {
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
            className={cn(!terminalsOpen && "text-muted-foreground")}
          >
            <PanelBottom />
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
