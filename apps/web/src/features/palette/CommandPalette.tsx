import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project, Session, SessionStatus } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { defaultFilter } from "cmdk"
import { cn } from "cn"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ChevronLeft, ChevronRight, CornerDownLeft, Filter } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { ProviderIcon, sessionProvider } from "@/features/providers/ProviderIcon"
import { allSessionsAtom, endSessionAtom } from "@/features/session/atoms"
import {
  openSetting,
  openSettings,
  SECTION_INFO,
  SETTINGS_SECTIONS,
} from "@/features/settings/settings"
import { SETTINGS_INDEX } from "@/features/settings/settingsIndex"
import { ThreadStatus } from "@/features/sidebar/ThreadLink"
import { isMac } from "@/features/terminal/keys"
import { openUsage } from "@/features/usage/usage"
import { COLOR_THEMES } from "@/lib/colorThemes"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { useColorTheme, useThemeChoice } from "@/lib/theme"
import {
  applySuggestion,
  asksForEnded,
  filterSuggestions,
  hasFilters,
  parseFilters,
  type ThreadFilters,
  threadMatches,
} from "./filters.ts"
import {
  flattenPages,
  frequentCommands,
  groupCommands,
  insideTerminal,
  isPaletteShortcut,
  type PaletteCommand,
  type PaletteOutcome,
  type PalettePage,
  rankedByUse,
  readThreadVisits,
  readUsage,
  splitPaletteInput,
  storeUsage,
  type Usage,
  usePaletteSources,
  useRegisteredCommands,
  withUseNow,
} from "./registry.ts"
import { CommandPreview, EmptyPreview, FilterPreview } from "./CommandPreview.tsx"
import { ThreadPreview } from "./ThreadPreview.tsx"

const THREAD_LIMIT = 40
const ATTENTION: ReadonlyArray<SessionStatus> = ["waiting_for_human", "error"]

const onPaletteOpen = new Set<(open: boolean) => void>()

export const openCommandPalette = () => {
  for (const listener of onPaletteOpen) listener(true)
}

export interface MessageSearch {
  readonly Results: (props: {
    readonly query: string
    readonly filters?: ThreadFilters | undefined
    readonly onPick: () => void
  }) => ReactNode
}

interface Thread {
  readonly session: Session
  readonly project: Project
}

const copy = (text: string) => void navigator.clipboard?.writeText(text)

const caretAtEnd = (target: EventTarget): boolean =>
  !(target instanceof HTMLInputElement) ||
  (target.selectionStart === target.value.length && target.selectionEnd === target.value.length)

export function CommandPalette({ messages }: { readonly messages?: MessageSearch | undefined }) {
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(0)
  const [visits, setVisits] = useState<Usage>({})
  const [search, setSearch] = useState("")
  const [pages, setPages] = useState<ReadonlyArray<PalettePage>>([])
  const [returns, setReturns] = useState<ReadonlyArray<string>>([])
  const [usage, setUsage] = useState(readUsage)
  const [highlighted, setHighlighted] = useState("")
  const [pending, setPending] = useState<string>()
  const [error, setError] = useState<string>()
  const navigate = useNavigate()
  const [scheme, chooseScheme] = useThemeChoice()
  const [colorTheme, chooseColorTheme] = useColorTheme()
  const registered = useRegisteredCommands()
  const sources = usePaletteSources()
  const sessions = useAtomValue(allSessionsAtom)
  const projects = useAtomValue(projectsAtom)
  const end = useAtomSet(endSessionAtom, { mode: "promiseExit" })
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  const page = pages.at(-1)
  const listArea = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const viewport = listArea.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    )
    if (viewport !== null && viewport !== undefined) viewport.scrollTop = 0
  }, [search, pages])
  const input = splitPaletteInput(search)
  const parsed = parseFilters(input.body)
  const freeText = page === undefined ? parsed.text.trim() : search.trim()
  const mode = page === undefined ? input.mode : "actions"

  const show = useCallback(() => {
    setOpenedAt(Date.now())
    setVisits(readThreadVisits())
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setSearch("")
    setPages([])
    setReturns([])
    setPending(undefined)
    setError(undefined)
  }, [])

  useEffect(() => {
    const listener = (next: boolean) => (next ? show() : close())
    onPaletteOpen.add(listener)
    return () => {
      onPaletteOpen.delete(listener)
    }
  }, [close, show])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isPaletteShortcut(event, isMac()) || insideTerminal(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (openRef.current) close()
      else show()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [close, show])

  const goTo = useCallback(
    (session: Session) => {
      close()
      void navigate({
        to: "/projects/$projectId/sessions/$sessionId",
        params: { projectId: session.projectId, sessionId: session.id },
      })
    },
    [close, navigate],
  )

  const builtIn = useMemo(
    (): ReadonlyArray<PaletteCommand> => [
      {
        id: "thread.new",
        title: "New thread",
        group: "General",
        keywords: ["chat", "start"],
        run: () => void navigate({ to: "/" }),
      },
      {
        id: "usage.open",
        title: "Usage: tokens and cost",
        group: "General",
        keywords: ["tokens", "cost", "dashboard", "limits", "spend"],
        run: openUsage,
      },
      {
        id: "project.add",
        title: "Add a repository",
        group: "General",
        keywords: ["project", "clone", "open"],
        run: openAddRepository,
      },
      {
        id: "theme.scheme",
        title: "Color scheme",
        group: "General",
        detail: scheme === "system" ? "Match the system" : scheme === "dark" ? "Dark" : "Light",
        keywords: ["theme", "appearance", "mode", "dark", "light"],
        page: {
          title: "Color scheme",
          items: (["light", "dark", "system"] as const).map((choice): PaletteCommand => ({
            id: `theme.${choice}`,
            title: choice === "system" ? "Match the system" : choice === "dark" ? "Dark" : "Light",
            group: "Color scheme",
            checked: scheme === choice,
            run: () => chooseScheme(choice),
          })),
        },
      },
      {
        id: "theme.color",
        title: "Color theme",
        group: "General",
        detail: COLOR_THEMES.find((theme) => theme.id === colorTheme)?.label,
        keywords: ["theme", "colors", "palette", "accent", "appearance"],
        page: {
          title: "Color theme",
          items: COLOR_THEMES.map((theme): PaletteCommand => ({
            id: `theme.color.${theme.id}`,
            title: theme.label,
            group: "Color theme",
            detail: theme.description,
            checked: theme.id === colorTheme,
            run: () => chooseColorTheme(theme.id),
          })),
        },
      },
      ...SETTINGS_SECTIONS.map((section): PaletteCommand => ({
        id: `settings.${section}`,
        title: `Settings: ${SECTION_INFO[section].label}`,
        group: "Settings",
        keywords: [...SECTION_INFO[section].keywords],
        run: () => openSettings(section),
      })),
    ],
    [chooseColorTheme, chooseScheme, colorTheme, navigate, scheme],
  )

  const settingCommands = useMemo(
    (): ReadonlyArray<PaletteCommand> =>
      SETTINGS_INDEX.map((entry) => ({
        id: `setting.${entry.section}.${entry.label}`,
        title: entry.label,
        group: "Settings",
        detail: `Settings · ${SECTION_INFO[entry.section].label}`,
        keywords: [SECTION_INFO[entry.section].label, "settings", ...(entry.keywords ?? [])],
        run: () => openSetting(entry.section, entry.label),
      })),
    [],
  )

  const commands = useMemo(() => [...registered, ...builtIn], [registered, builtIn])
  const threads = useMemo(
    () =>
      AsyncResult.isSuccess(sessions) && AsyncResult.isSuccess(projects)
        ? threadList(sessions.value, projects.value)
        : [],
    [projects, sessions],
  )
  const titles = useMemo(
    () => new Map(threads.map(({ session }) => [session.id as string, session.title] as const)),
    [threads],
  )

  const runCommand = async (command: PaletteCommand) => {
    if (pending !== undefined) return
    if (command.page !== undefined) {
      pushPage(command.page)
      return
    }
    const next = withUseNow(usage, command.id)
    setUsage(next)
    storeUsage(next)
    const result = command.run()
    if (!(result instanceof Promise)) {
      close()
      return
    }
    setError(undefined)
    setPending(command.title)
    const outcome: PaletteOutcome = await result
    setPending(undefined)
    if (outcome === undefined) close()
    else setError(outcome.error)
  }

  const pushPage = (next: PalettePage) => {
    setPages((current) => [...current, next])
    setReturns((current) => [...current, search])
    setSearch("")
    setError(undefined)
  }

  const popPage = () => {
    setPages((current) => current.slice(0, -1))
    setReturns((current) => current.slice(0, -1))
    setSearch(returns.at(-1) ?? "")
    setError(undefined)
  }

  const threadActions = (thread: Thread): PalettePage => {
    const { session, project } = thread
    const endWith = (removeWorktree: boolean) => async (): Promise<PaletteOutcome> => {
      const exit = await end({
        payload: { sessionId: session.id, removeWorktree },
        reactivityKeys: [keys.sessions(session.projectId)],
      })
      return Exit.isSuccess(exit) ? undefined : { error: describeCause(exit.cause) }
    }
    const onEnd = project.settings.worktreeOnEnd
    const endItems: ReadonlyArray<PaletteCommand> =
      session.inWorktree && onEnd === "ask"
        ? [
            {
              id: "thread-action.end.keep",
              title: "End it and keep the worktree",
              group: "End",
              detail: `The branch ${session.branch} is kept.`,
              run: endWith(false),
            },
            {
              id: "thread-action.end.remove",
              title: "End it and delete the worktree",
              group: "End",
              detail: "Uncommitted changes in it are lost. The branch is kept.",
              run: endWith(true),
            },
          ]
        : [
            {
              id: "thread-action.end.confirm",
              title: "End it",
              group: "End",
              detail: !session.inWorktree
                ? "The agent stops. Your checkout is left as it is."
                : onEnd === "remove"
                  ? "Its worktree is deleted, as the project's settings ask. The branch is kept."
                  : "Its worktree and branch are kept, as the project's settings ask.",
              run: endWith(session.inWorktree && onEnd === "remove"),
            },
          ]
    const link = `${window.location.origin}/projects/${session.projectId}/sessions/${session.id}`
    return {
      title: session.title,
      placeholder: "Search this thread's actions…",
      items: [
        {
          id: "thread-action.open",
          title: "Open",
          group: "Thread",
          run: () => goTo(session),
        },
        {
          id: "thread-action.copy-link",
          title: "Copy its link",
          group: "Thread",
          detail: link,
          run: () => copy(link),
        },
        {
          id: "thread-action.copy-branch",
          title: "Copy the branch name",
          group: "Thread",
          detail: session.branch,
          run: () => copy(session.branch),
        },
        ...(session.status === "ended"
          ? []
          : [
              {
                id: "thread-action.end",
                title: "End the thread",
                group: "Thread",
                keywords: ["stop", "archive", "close"],
                page: { title: `End “${session.title}”?`, items: endItems },
              } satisfies PaletteCommand,
            ]),
      ],
    }
  }

  const highlightedThread =
    page === undefined && highlighted.startsWith("thread:")
      ? threads.find(({ session }) => `thread:${session.id}` === highlighted)
      : undefined
  const commandIndex = new Map(
    [...commands, ...flattenPages(commands), ...settingCommands, ...(page?.items ?? [])].map(
      (command) => [command.id, command] as const,
    ),
  )
  const highlightedCommand = highlighted.startsWith("cmd:")
    ? commandIndex.get(highlighted.slice("cmd:".length))
    : highlighted.startsWith("recent:")
      ? commandIndex.get(highlighted.slice("recent:".length))
      : undefined

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (pending !== undefined) {
      if (event.key !== "Escape") event.preventDefault()
      return
    }
    if (event.key === "Backspace" && search === "" && pages.length > 0) {
      event.preventDefault()
      popPage()
      return
    }
    if (highlightedThread === undefined) return
    const wantsActions =
      (event.key === "ArrowRight" && caretAtEnd(event.target)) ||
      (event.key === "Enter" && (event.ctrlKey || event.metaKey))
    if (!wantsActions) return
    event.preventDefault()
    pushPage(threadActions(highlightedThread))
  }

  const sourceMode = mode === "files" || mode === "skills" ? mode : undefined
  const filtersOn = hasFilters(parsed.filters)
  const textual = freeText !== ""
  const showActions = mode === "actions" || (mode === "all" && !filtersOn)
  const showThreads = mode === "all" || mode === "threads"
  const suggestions =
    page === undefined && (mode === "threads" || mode === "messages")
      ? filterSuggestions(
          parsed.last,
          threads.map(({ project }) => project.name).filter(unique),
          threads.map(({ session }) => session.branch).filter(unique),
        )
      : []
  const typingFilter = parsed.last?.key !== undefined
  const highlightedSuggestion = suggestions.find(
    (suggestion) => `filter:${suggestion.label}` === highlighted,
  )
  const previewShown =
    sourceMode === undefined && mode !== "messages" && page?.Results === undefined
  const filtering = page?.Results === undefined && sourceMode === undefined && mode !== "messages"

  const threadGroups = ((): ReadonlyArray<readonly [string, ReadonlyArray<Thread>]> => {
    const matching = threads.filter(({ session, project }) =>
      threadMatches(session, project.name, parsed.filters),
    )
    if (textual || filtersOn) {
      const shown = asksForEnded(parsed.filters) || textual
      return [
        [
          "Threads",
          matching
            .filter(({ session }) => shown || session.status !== "ended")
            .toSorted(
              (a, b) => Number(a.session.status === "ended") - Number(b.session.status === "ended"),
            ),
        ],
      ]
    }
    const live = matching.filter(({ session }) => session.status !== "ended")
    const rest = live.filter(
      ({ session }) => !ATTENTION.includes(session.status) && session.status !== "running",
    )
    return [
      ["Needs you", live.filter(({ session }) => ATTENTION.includes(session.status))],
      ["Working", live.filter(({ session }) => session.status === "running")],
      [
        "Threads",
        rankedByUse(rest, ({ session }) => session.id, visits, openedAt).slice(0, THREAD_LIMIT),
      ],
    ]
  })()

  const renderThread = (thread: Thread) => (
    <ThreadItem key={thread.session.id} thread={thread} onSelect={() => goTo(thread.session)} />
  )

  const renderThreadGroups = (only?: "attention" | "rest") =>
    threadGroups
      .filter(([heading]) =>
        only === undefined
          ? true
          : only === "attention"
            ? heading !== "Threads"
            : heading === "Threads",
      )
      .map(([heading, items]) =>
        items.length === 0 ? null : (
          <CommandGroup key={heading} heading={heading}>
            {items.map(renderThread)}
          </CommandGroup>
        ),
      )

  const suggestionGroup = suggestions.length > 0 && parsed.last !== undefined && (
    <CommandGroup heading="Filters" forceMount>
      {suggestions.map((suggestion) => (
        <CommandItem
          key={suggestion.label}
          value={`filter:${suggestion.label}`}
          check={false}
          forceMount
          onSelect={() => {
            if (parsed.last === undefined) return
            setSearch(
              `${input.prefix}${applySuggestion(input.body, parsed.last, suggestion.insert)}`,
            )
            inputRef.current?.focus()
          }}
        >
          <Filter className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{suggestion.label}</span>
          <span className="min-w-0 max-w-[55%] truncate text-right text-xs text-muted-foreground">
            {suggestion.detail}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  )

  const rootContent = () => {
    if (mode === "messages") {
      return messages === undefined ? null : (
        <>
          {typingFilter && suggestionGroup}
          <messages.Results query={freeText} filters={parsed.filters} onPick={close} />
          {!typingFilter && suggestionGroup}
        </>
      )
    }
    if (sourceMode !== undefined) {
      const source = sources.get(sourceMode)
      return source === undefined ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {sourceMode === "files"
            ? "Open a thread to find its files."
            : "Open a thread that takes messages to add a skill to it."}
        </p>
      ) : (
        <source.Results query={freeText} close={close} />
      )
    }
    const frequent = !textual && showActions ? frequentCommands(commands, usage, openedAt) : []
    return (
      <>
        {typingFilter && suggestionGroup}
        {frequent.length > 0 && (
          <CommandGroup heading="Recent">
            {frequent.map((command) => (
              <PaletteItem
                key={`recent-${command.id}`}
                value={`recent:${command.id}`}
                command={command}
                onRun={runCommand}
              />
            ))}
          </CommandGroup>
        )}
        {showThreads && !textual && renderThreadGroups("attention")}
        {showActions &&
          groupCommands([
            ...commands,
            ...(textual ? [...flattenPages(commands), ...settingCommands] : []),
          ]).map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((command) => (
                <PaletteItem
                  key={`${command.id}:${command.title}`}
                  value={`cmd:${command.id}`}
                  command={command}
                  onRun={runCommand}
                />
              ))}
            </CommandGroup>
          ))}
        {showThreads && renderThreadGroups(textual ? undefined : "rest")}
        {!typingFilter && suggestionGroup}
      </>
    )
  }

  const pageContent = (current: PalettePage) => {
    if (current.Results !== undefined) {
      return <current.Results query={freeText} close={close} />
    }
    const grouped = groupCommands(current.items ?? [])
    return grouped.map(([group, items]) => (
      <CommandGroup key={group} heading={grouped.length > 1 ? group : undefined}>
        {items.map((command) => (
          <PaletteItem
            key={command.id}
            value={`cmd:${command.id}`}
            command={command}
            onRun={runCommand}
          />
        ))}
      </CommandGroup>
    ))
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? show() : close())}
      title="Command palette"
      description="Run a command, go to a thread, or search messages"
      className="top-[12svh] sm:max-w-3xl"
      onEscapeKeyDown={(event) => {
        if (pages.length === 0) return
        event.preventDefault()
        popPage()
      }}
    >
      <Command
        value={highlighted}
        onValueChange={setHighlighted}
        onKeyDown={onKeyDown}
        filter={(value, _search, keywords) => defaultFilter(value, freeText, keywords)}
        shouldFilter={filtering}
      >
        {page !== undefined && (
          <div className="flex items-center gap-1 px-2 pt-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={popPage}
              className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
              Back
            </button>
            {pages.map((each, index) => (
              <span key={index} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3 shrink-0" />
                <span className={cn("truncate", index === pages.length - 1 && "text-foreground")}>
                  {each.title}
                </span>
              </span>
            ))}
          </div>
        )}
        <CommandInput
          ref={inputRef}
          value={search}
          onValueChange={(next) => {
            setSearch(next)
            setError(undefined)
          }}
          disabled={pending !== undefined}
          placeholder={
            page === undefined
              ? "Search actions and threads, or start with > # ? @ /"
              : (page.placeholder ?? `Search ${page.title}…`)
          }
        />
        <div className="flex h-[min(30rem,62svh)] min-h-0">
          <div ref={listArea} className="min-w-0 flex-1">
            <CommandList className="max-h-[min(30rem,62svh)]">
              {filtering && <CommandEmpty>Nothing matches.</CommandEmpty>}
              {page === undefined ? rootContent() : pageContent(page)}
            </CommandList>
          </div>
          {previewShown && (
            <aside
              aria-label="Details"
              className="hidden w-64 shrink-0 overflow-y-auto border-l md:flex"
            >
              {highlightedThread !== undefined ? (
                <ThreadPreview
                  session={highlightedThread.session}
                  project={highlightedThread.project}
                  parentTitle={
                    highlightedThread.session.parentId == null
                      ? undefined
                      : titles.get(highlightedThread.session.parentId)
                  }
                  now={openedAt}
                />
              ) : highlightedCommand !== undefined ? (
                <CommandPreview command={highlightedCommand} />
              ) : highlightedSuggestion !== undefined ? (
                <FilterPreview suggestion={highlightedSuggestion} />
              ) : (
                <EmptyPreview />
              )}
            </aside>
          )}
        </div>
        <Footer
          pending={pending}
          error={error}
          inPage={page !== undefined}
          onThread={highlightedThread !== undefined}
        />
      </Command>
    </CommandDialog>
  )
}

const unique = <T,>(value: T, index: number, all: ReadonlyArray<T>) => all.indexOf(value) === index

function ThreadItem({
  thread,
  onSelect,
}: {
  readonly thread: Thread
  readonly onSelect: () => void
}) {
  const { session, project } = thread
  return (
    <CommandItem
      value={`thread:${session.id}`}
      check={false}
      keywords={[session.title, project.name, session.branch, session.provider]}
      onSelect={onSelect}
    >
      <ProviderIcon provider={sessionProvider(session)} className="size-4" />
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden items-center gap-1 sm:flex">
          <ProjectIcon project={project} className="size-3.5" />
          <span className="max-w-32 truncate">{project.name}</span>
        </span>
        <ThreadStatus status={session.status} />
      </span>
    </CommandItem>
  )
}

function PaletteItem({
  command,
  value,
  onRun,
}: {
  readonly command: PaletteCommand
  readonly value: string
  readonly onRun: (command: PaletteCommand) => Promise<void>
}) {
  return (
    <CommandItem
      value={value}
      keywords={[command.title, command.group, command.detail ?? "", ...(command.keywords ?? [])]}
      onSelect={() => void onRun(command)}
      check={command.checked !== undefined}
      data-checked={command.checked === true}
      aria-current={command.checked === true ? "true" : undefined}
    >
      {command.icon ?? <CornerDownLeft className="size-4 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{command.title}</span>
      {command.detail !== undefined && (
        <span className="min-w-0 max-w-[55%] truncate text-right text-xs text-muted-foreground">
          {command.detail}
        </span>
      )}
      {command.shortcut !== undefined && <CommandShortcut>{command.shortcut}</CommandShortcut>}
      {command.page !== undefined && <ChevronRight className="size-4 text-muted-foreground" />}
    </CommandItem>
  )
}

function Footer({
  pending,
  error,
  inPage,
  onThread,
}: {
  readonly pending: string | undefined
  readonly error: string | undefined
  readonly inPage: boolean
  readonly onThread: boolean
}) {
  return (
    <div className="flex min-h-9 items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
      {pending !== undefined ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-3.5" /> {pending}…
        </span>
      ) : error !== undefined ? (
        <span className="min-w-0 flex-1 text-destructive" role="alert">
          {error}
        </span>
      ) : (
        <>
          <Hint keys="↵">{inPage ? "Choose" : "Open"}</Hint>
          {inPage && <Hint keys="Esc">Back</Hint>}
          {onThread && <Hint keys="→">More actions</Hint>}
          {!inPage && (
            <span className="ml-auto hidden items-center gap-3 sm:flex">
              <Hint keys=">">Actions</Hint>
              <Hint keys="#">Threads</Hint>
              <Hint keys="?">Messages</Hint>
              <Hint keys="@">Files</Hint>
              <Hint keys="/">Skills</Hint>
            </span>
          )}
        </>
      )}
    </div>
  )
}

function Hint({ keys: label, children }: { readonly keys: string; readonly children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Kbd>{label}</Kbd>
      {children}
    </span>
  )
}

const threadList = (
  sessions: ReadonlyArray<Session>,
  projects: ReadonlyArray<Project>,
): ReadonlyArray<Thread> => {
  const byId = new Map(projects.map((project) => [project.id, project] as const))
  return sessions
    .flatMap((session) => {
      const project = byId.get(session.projectId)
      return project === undefined ? [] : [{ session, project }]
    })
    .toSorted((a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt))
}
