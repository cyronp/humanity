import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  DEFAULT_TERMINAL_PREFERENCES,
  type TerminalInfo,
  terminalLabel,
  type TerminalOwner,
  terminalOwnerKey,
} from "@humanity/contracts"
import { cn } from "cn"
import { Cause, Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import {
  Bot,
  ChevronDown,
  Eraser,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SquareTerminal,
  X,
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  closeTerminalAtom,
  openTerminalAtom,
  renameTerminalAtom,
  restartTerminalAtom,
  shellsAtom,
  terminalPreferencesAtom,
  terminalsAtom,
} from "./atoms.ts"
import { cycleTerminal, lastActiveTerminal, pickActive, rememberActiveTerminal } from "./dock.ts"
import { shortcutLabel, type TerminalCommand } from "./keys.ts"
import { TerminalFind } from "./TerminalFind.tsx"
import { TerminalView, type TerminalViewHandle } from "./TerminalView.tsx"

const failureMessage = (exit: Exit.Exit<unknown, unknown>): string | undefined => {
  if (Exit.isSuccess(exit)) return undefined
  const error = Cause.squash(exit.cause)
  return error instanceof Error ? error.message : String(error)
}

/** What the workspace's keyboard shortcuts ask of the dock. */
export interface DockCommands {
  readonly cycle: (step: 1 | -1) => void
}

/**
 * The owner's terminals (a thread's, or a project's outside any thread), as tabs, under the
 * chat. Opening the dock on an owner that has none opens one.
 */
export function TerminalDock({
  owner,
  unavailable,
  onHide,
  commandsRef,
  newTerminalRequest,
}: {
  readonly owner: TerminalOwner
  /** Why no terminal can be opened here now (a thread that ended), or nothing when one can. */
  readonly unavailable?: string | undefined
  readonly onHide: () => void
  readonly commandsRef: { current: DockCommands | null }
  /** Goes up each time the human asks for one more terminal. */
  readonly newTerminalRequest: number
}) {
  const ownerKey = terminalOwnerKey(owner)
  const ownerJson = JSON.stringify(owner)
  const result = useAtomValue(terminalsAtom(ownerJson))
  const terminals = AsyncResult.isSuccess(result) ? result.value : undefined
  const preferencesResult = useAtomValue(terminalPreferencesAtom)
  const preferences = AsyncResult.isSuccess(preferencesResult)
    ? preferencesResult.value
    : DEFAULT_TERMINAL_PREFERENCES
  const [wanted, setWanted] = useState(() => lastActiveTerminal(ownerKey))
  const active = terminals === undefined ? undefined : pickActive(terminals, wanted)
  const [error, setError] = useState<string>()
  /** The terminal the find bar searches, while it is open. */
  const [finding, setFinding] = useState<TerminalViewHandle>()
  const [renaming, setRenaming] = useState<string>()
  const [menu, setMenu] = useState<{
    readonly x: number
    readonly y: number
    readonly terminal: TerminalInfo
    readonly view: TerminalViewHandle | undefined
  }>()
  const views = useRef(new Map<string, TerminalViewHandle>())
  const canOpen = unavailable === undefined

  const open = useAtomSet(openTerminalAtom, { mode: "promiseExit" })
  const close = useAtomSet(closeTerminalAtom, { mode: "promiseExit" })
  const restart = useAtomSet(restartTerminalAtom, { mode: "promiseExit" })
  const rename = useAtomSet(renameTerminalAtom, { mode: "promiseExit" })

  const show = useCallback(
    (terminalId: string | undefined) => {
      if (terminalId === undefined) return
      setWanted(terminalId)
      rememberActiveTerminal(ownerKey, terminalId)
    },
    [ownerKey],
  )

  const opening = useRef(false)
  const openTerminal = useCallback(
    async (shell: string | null = null) => {
      if (opening.current) return
      opening.current = true
      setError(undefined)
      const exit = await open({ payload: { owner: JSON.parse(ownerJson) as TerminalOwner, shell } })
      opening.current = false
      if (Exit.isSuccess(exit)) show(exit.value.id)
      else setError(failureMessage(exit))
    },
    [open, ownerJson, show],
  )

  // A dock opened on a thread with no terminal starts one, once; Ctrl+Shift+` asks for one more.
  const autoStarted = useRef(false)
  const handledRequest = useRef(newTerminalRequest)
  useEffect(() => {
    if (terminals === undefined || !canOpen) return
    if (newTerminalRequest > handledRequest.current) {
      handledRequest.current = newTerminalRequest
      autoStarted.current = true
      void openTerminal()
    } else if (terminals.length === 0 && !autoStarted.current) {
      autoStarted.current = true
      void openTerminal()
    }
  }, [terminals, canOpen, newTerminalRequest, openTerminal])

  useEffect(() => {
    commandsRef.current = {
      cycle: (step) => show(cycleTerminal(terminals ?? [], active, step)),
    }
    return () => {
      commandsRef.current = null
    }
  }, [commandsRef, show, terminals, active])

  const closeTerminal = async (terminal: TerminalInfo) => {
    setError(undefined)
    const exit = await close({ payload: { terminalId: terminal.id } })
    setError(failureMessage(exit))
    if (terminals !== undefined && terminals.length <= 1) onHide()
  }

  /** Closes every terminal here, stopping what runs in them, and the dock with them. */
  const closeAll = async () => {
    setError(undefined)
    const exits = await Promise.all(
      (terminals ?? []).map((terminal) => close({ payload: { terminalId: terminal.id } })),
    )
    const failed = exits.map(failureMessage).find((message) => message !== undefined)
    if (failed !== undefined) setError(failed)
    else onHide()
  }

  const restartTerminal = async (terminal: TerminalInfo) => {
    setError(undefined)
    setError(failureMessage(await restart({ payload: { terminalId: terminal.id } })))
    views.current.get(terminal.id)?.focus()
  }

  const shownView = () => (active === undefined ? undefined : views.current.get(active))
  const find = () => setFinding(shownView())

  const onCommand = (command: TerminalCommand) => {
    if (command === "find") find()
  }

  const current = terminals?.find((terminal) => terminal.id === active)

  return (
    <section
      aria-label="Terminals"
      data-terminal-dock=""
      className="flex h-full min-h-0 flex-col border-t bg-background"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-1 pl-2">
        <div
          role="tablist"
          aria-label="Terminals"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none"
        >
          {terminals?.map((terminal) => (
            <TerminalTab
              key={terminal.id}
              terminal={terminal}
              selected={terminal.id === active}
              renaming={renaming === terminal.id}
              onSelect={() => show(terminal.id)}
              onClose={() => void closeTerminal(terminal)}
              onRenameStart={() => setRenaming(terminal.id)}
              onRename={(title) => {
                setRenaming(undefined)
                if (title !== undefined)
                  void rename({ payload: { terminalId: terminal.id, title } })
                views.current.get(terminal.id)?.focus()
              }}
            />
          ))}
          <NewTerminalButtons disabled={!canOpen} onOpen={(shell) => void openTerminal(shell)} />
        </div>
        <DockAction label="Find" shortcut="Ctrl+F" onClick={find} disabled={current === undefined}>
          <Search />
        </DockAction>
        <DockAction
          label="Clear"
          onClick={() => shownView()?.clear()}
          disabled={current === undefined}
        >
          <Eraser />
        </DockAction>
        <DockAction
          label="Restart"
          onClick={() => current !== undefined && void restartTerminal(current)}
          disabled={current === undefined}
        >
          <RotateCcw />
        </DockAction>
        <DockAction label="Hide the terminals" shortcut="Ctrl+`" onClick={onHide}>
          <Minus />
        </DockAction>
        <DockAction
          label="Close terminal"
          onClick={() => void closeAll()}
          disabled={terminals === undefined || terminals.length === 0}
        >
          <X />
        </DockAction>
      </div>
      {error !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          {error}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        {terminals?.map((terminal) => (
          <TerminalView
            key={terminal.id}
            ref={(handle) => {
              if (handle === null) views.current.delete(terminal.id)
              else views.current.set(terminal.id, handle)
            }}
            info={terminal}
            active={terminal.id === active}
            fontSize={preferences.fontSize}
            scrollback={preferences.scrollback}
            onCommand={onCommand}
            onContextMenu={(at) =>
              setMenu({ ...at, terminal, view: views.current.get(terminal.id) })
            }
          />
        ))}
        {terminals !== undefined && terminals.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {unavailable ?? "Opening a terminal…"}
          </div>
        )}
        {current?.state === "exited" && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t bg-muted/90 px-3 py-1.5 text-xs backdrop-blur">
            <span className="text-muted-foreground">
              {current.exitCode === null
                ? "The process ended."
                : `The process exited with code ${current.exitCode}.`}
            </span>
            <Button size="xs" variant="outline" onClick={() => void restartTerminal(current)}>
              Restart
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void closeTerminal(current)}>
              Close
            </Button>
          </div>
        )}
        {finding?.search !== undefined && (
          <TerminalFind
            search={finding.search}
            onClose={() => {
              setFinding(undefined)
              finding.focus()
            }}
          />
        )}
        {menu !== undefined && (
          <TerminalMenu
            at={menu}
            onClose={() => setMenu(undefined)}
            view={menu.view}
            onFind={() => setFinding(menu.view)}
            onRename={() => setRenaming(menu.terminal.id)}
            onRestart={() => void restartTerminal(menu.terminal)}
            onCloseTerminal={() => void closeTerminal(menu.terminal)}
          />
        )}
      </div>
    </section>
  )
}

function DockAction({
  label,
  shortcut,
  onClick,
  disabled = false,
  children,
}: {
  readonly label: string
  readonly shortcut?: string
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="text-muted-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {shortcut === undefined ? label : `${label} (${shortcutLabel(shortcut)})`}{" "}
      </TooltipContent>
    </Tooltip>
  )
}

function TerminalTab({
  terminal,
  selected,
  renaming,
  onSelect,
  onClose,
  onRenameStart,
  onRename,
}: {
  readonly terminal: TerminalInfo
  readonly selected: boolean
  readonly renaming: boolean
  readonly onSelect: () => void
  readonly onClose: () => void
  readonly onRenameStart: () => void
  readonly onRename: (title: string | undefined) => void
}) {
  const label = terminalLabel(terminal)
  const details = [
    terminal.shellName,
    terminal.cwd,
    terminal.opener === "agent" ? "opened by the agent" : undefined,
    terminal.location === "checkout" ? "still in the project's checkout" : undefined,
  ].filter((detail) => detail !== undefined)

  return (
    <div
      className={cn(
        "group flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-md pr-0.5 pl-2 text-xs",
        selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      {renaming ? (
        <input
          autoFocus
          aria-label="Terminal name"
          defaultValue={terminal.title ?? ""}
          placeholder={label}
          className="h-6 w-32 rounded-sm border bg-background px-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onKeyDown={(event) => {
            if (event.key === "Enter") onRename(event.currentTarget.value)
            if (event.key === "Escape") onRename(undefined)
          }}
          onBlur={(event) => onRename(event.currentTarget.value)}
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          title={details.join(" · ")}
          onClick={onSelect}
          onDoubleClick={onRenameStart}
          className="flex min-w-0 items-center gap-1.5 outline-none focus-visible:underline"
        >
          {terminal.opener === "agent" ? (
            <Bot className="size-3.5 shrink-0" aria-label="Opened by the agent" />
          ) : (
            <SquareTerminal className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
          {terminal.busy === true && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-info"
              aria-label="Running a command"
            />
          )}
          {terminal.location === "checkout" && (
            <span className="shrink-0 rounded-sm bg-warning/15 px-1 text-[10px] text-warning-foreground">
              checkout
            </span>
          )}
          {terminal.state === "exited" && (
            <span className="shrink-0 text-[10px] text-muted-foreground">exited</span>
          )}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Close ${label}`}
        onClick={onClose}
        className={cn(
          "size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          selected && "opacity-100",
        )}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

function NewTerminalButtons({
  disabled,
  onOpen,
}: {
  readonly disabled: boolean
  readonly onOpen: (shell: string | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="New terminal"
            disabled={disabled}
            onClick={() => onOpen(null)}
            className="text-muted-foreground"
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{`New terminal (${shortcutLabel("Ctrl+Shift+`")})`}</TooltipContent>
      </Tooltip>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="New terminal with another shell"
            disabled={disabled}
            className="w-4 text-muted-foreground"
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {menuOpen && <ShellItems onOpen={onOpen} />}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ShellItems({ onOpen }: { readonly onOpen: (shell: string | null) => void }) {
  const result = useAtomValue(shellsAtom)
  if (!AsyncResult.isSuccess(result)) {
    return (
      <DropdownMenuLabel className="text-muted-foreground">Looking for shells…</DropdownMenuLabel>
    )
  }
  if (result.value.length === 0) {
    return (
      <DropdownMenuLabel className="text-muted-foreground">No shell was found.</DropdownMenuLabel>
    )
  }
  return (
    <>
      <DropdownMenuLabel>New terminal with</DropdownMenuLabel>
      {result.value.map((shell) => (
        <DropdownMenuItem key={shell.id} title={shell.path} onSelect={() => onOpen(shell.id)}>
          {shell.name}
        </DropdownMenuItem>
      ))}
    </>
  )
}

/** The menu a right-click in a terminal opens, where the pointer is. */
function TerminalMenu({
  at,
  view,
  onClose,
  onFind,
  onRename,
  onRestart,
  onCloseTerminal,
}: {
  readonly at: { readonly x: number; readonly y: number }
  readonly view: TerminalViewHandle | undefined
  readonly onClose: () => void
  readonly onFind: () => void
  readonly onRename: () => void
  readonly onRestart: () => void
  readonly onCloseTerminal: () => void
}) {
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="fixed size-0" style={{ left: at.x, top: at.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={() => view?.focus()}>
        <DropdownMenuItem onSelect={() => void view?.copySelection()}>Copy</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void navigator.clipboard.readText().then(
              (text) => view?.paste(text),
              () => undefined,
            )
          }
        >
          Paste
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => view?.selectAll()}>Select all</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onFind}>Find…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => view?.clear()}>Clear</DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>Rename…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRestart}>Restart</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onCloseTerminal}>
          Close
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
