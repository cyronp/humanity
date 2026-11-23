import { useAtomValue } from "@effect/atom-react"
import type { Project, Session } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { defaultFilter } from "cmdk"
import { AsyncResult } from "effect/reactivity"
import { CornerDownLeft } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
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
import { openAddRepository } from "@/features/projects/addRepository"
import { projectsAtom } from "@/features/projects/atoms"
import { ProjectIcon } from "@/features/projects/ProjectIcon"
import { ProviderIcon, sessionProvider } from "@/features/providers/ProviderIcon"
import { allSessionsAtom } from "@/features/session/atoms"
import { openSettings, SECTION_INFO, SETTINGS_SECTIONS } from "@/features/settings/settings"
import { isMac } from "@/features/terminal/keys"
import { openUsage } from "@/features/usage/usage"
import { useThemeChoice } from "@/lib/theme"
import {
  groupCommands,
  insideTerminal,
  isPaletteShortcut,
  type PaletteCommand,
  parsePaletteQuery,
  readRecent,
  recentCommands,
  storeRecent,
  useRegisteredCommands,
  withRecent,
} from "./registry.ts"

const THREAD_LIMIT = 40

const onPaletteOpen = new Set<(open: boolean) => void>()

export const openCommandPalette = () => {
  for (const listener of onPaletteOpen) listener(true)
}

export function CommandPalette({ messages }: { readonly messages?: MessageSearch | undefined }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [recent, setRecent] = useState(readRecent)
  const navigate = useNavigate()
  const [, chooseTheme] = useThemeChoice()
  const registered = useRegisteredCommands()
  const sessions = useAtomValue(allSessionsAtom)
  const projects = useAtomValue(projectsAtom)
  const query = parsePaletteQuery(search)

  useEffect(() => {
    onPaletteOpen.add(setOpen)
    return () => {
      onPaletteOpen.delete(setOpen)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event, isMac()) || insideTerminal(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      setOpen((current) => !current)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

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
      ...(["light", "dark", "system"] as const).map((choice): PaletteCommand => ({
        id: `theme.${choice}`,
        title: `Color scheme: ${choice === "system" ? "match the system" : choice}`,
        group: "General",
        keywords: ["theme", "appearance", "mode"],
        run: () => chooseTheme(choice),
      })),
      ...SETTINGS_SECTIONS.map((section): PaletteCommand => ({
        id: `settings.${section}`,
        title: `Settings: ${SECTION_INFO[section].label}`,
        group: "Settings",
        keywords: [...SECTION_INFO[section].keywords],
        run: () => openSettings(section),
      })),
    ],
    [chooseTheme, navigate],
  )

  const commands = useMemo(() => [...registered, ...builtIn], [registered, builtIn])
  const threads = useMemo(
    () =>
      AsyncResult.isSuccess(sessions) && AsyncResult.isSuccess(projects)
        ? threadList(sessions.value, projects.value)
        : [],
    [projects, sessions],
  )

  const close = () => {
    setOpen(false)
    setSearch("")
  }

  const runCommand = (command: PaletteCommand) => {
    const next = withRecent(recent, command.id)
    setRecent(next)
    storeRecent(next)
    close()
    command.run()
  }

  const goTo = (session: Session) => {
    close()
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: session.projectId, sessionId: session.id },
    })
  }

  const showActions = query.mode === "all" || query.mode === "actions"
  const showThreads = query.mode === "all" || query.mode === "threads"
  const firstUse = recentCommands(commands, recent)

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      title="Command palette"
      description="Run a command, go to a thread, or search messages"
    >
      <Command
        filter={(value, text, keywords) =>
          query.mode === "messages"
            ? 1
            : defaultFilter(value, parsePaletteQuery(text).text, keywords)
        }
        shouldFilter={query.mode !== "messages"}
      >
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Type a command, # for threads, ? to search messages"
        />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {query.mode === "messages" && messages !== undefined && (
            <messages.Results query={query.text} onPick={close} />
          )}
          {showActions && query.text === "" && firstUse.length > 0 && (
            <CommandGroup heading="Recent">
              {firstUse.map((command) => (
                <PaletteItem
                  key={`recent-${command.id}`}
                  value={`recent ${command.title}`}
                  command={command}
                  onRun={runCommand}
                />
              ))}
            </CommandGroup>
          )}
          {showActions &&
            groupCommands(commands).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((command) => (
                  <PaletteItem
                    key={command.id}
                    value={`${group} ${command.title}`}
                    command={command}
                    onRun={runCommand}
                  />
                ))}
              </CommandGroup>
            ))}
          {showThreads && threads.length > 0 && (
            <CommandGroup heading="Threads">
              {(query.text === "" ? threads.slice(0, THREAD_LIMIT) : threads).map(
                ({ session, project }) => (
                  <CommandItem
                    key={session.id}
                    value={`thread ${session.title} ${session.id}`}
                    keywords={[project.name, session.branch]}
                    onSelect={() => goTo(session)}
                  >
                    <ProviderIcon provider={sessionProvider(session)} className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <ProjectIcon project={project} className="size-3.5" />
                      {project.name}
                    </span>
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

export interface MessageSearch {
  readonly Results: (props: { readonly query: string; readonly onPick: () => void }) => ReactNode
}

function PaletteItem({
  command,
  value,
  onRun,
}: {
  readonly command: PaletteCommand
  readonly value: string
  readonly onRun: (command: PaletteCommand) => void
}) {
  return (
    <CommandItem
      value={value}
      keywords={[...(command.keywords ?? [])]}
      onSelect={() => onRun(command)}
    >
      <CornerDownLeft className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{command.title}</span>
      {command.shortcut !== undefined && <CommandShortcut>{command.shortcut}</CommandShortcut>}
    </CommandItem>
  )
}

const threadList = (
  sessions: ReadonlyArray<Session>,
  projects: ReadonlyArray<Project>,
): ReadonlyArray<{ readonly session: Session; readonly project: Project }> => {
  const byId = new Map(projects.map((project) => [project.id, project] as const))
  return sessions
    .flatMap((session) => {
      const project = byId.get(session.projectId)
      return project === undefined ? [] : [{ session, project }]
    })
    .toSorted((a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt))
}
