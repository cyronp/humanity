import { cn } from "cn"
import {
  Blocks,
  CircleHelp,
  FolderCog,
  FolderGit2,
  type LucideIcon,
  Plug,
  Search,
} from "lucide-react"
import { type ComponentType, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { openOnboarding } from "@/features/onboarding/onboarding"
import { ExtensionsSettings } from "./ExtensionsSettings.tsx"
import { ProjectsSettings } from "./ProjectsSettings.tsx"
import { ProvidersSettings } from "./ProvidersSettings.tsx"
import { RepositoriesSettings } from "./RepositoriesSettings.tsx"
import {
  closeSettings,
  matchSections,
  openSettings,
  SECTION_INFO,
  type SettingsSection,
  useSettings,
} from "./settings.ts"

const SECTION_VIEWS: Record<
  SettingsSection,
  { readonly icon: LucideIcon; readonly View: ComponentType }
> = {
  providers: { icon: Plug, View: ProvidersSettings },
  repositories: { icon: FolderGit2, View: RepositoriesSettings },
  projects: { icon: FolderCog, View: ProjectsSettings },
  extensions: { icon: Blocks, View: ExtensionsSettings },
}

/** The settings, floating over the app: the sections on the left, the chosen one on the right. */
export function SettingsDialog() {
  const { open, section } = useSettings()
  const [query, setQuery] = useState("")
  const { View } = SECTION_VIEWS[section]

  const close = () => {
    closeSettings()
    setQuery("")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent
        className="flex h-[min(50rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(64rem,calc(100%-2rem))]"
        onEscapeKeyDown={(event) => {
          // The first Escape clears a search; the next one closes the settings.
          if (query === "") return
          event.preventDefault()
          setQuery("")
        }}
      >
        <div className="shrink-0 border-b px-4 py-3">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Providers and their accounts, where repositories come from, each project's rules, and
            the MCP servers and skills the agent can use.
          </DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 items-center gap-3 border-b p-3 md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:p-4"
          >
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search settings"
                className="pl-8"
              />
            </div>
            <SectionList query={query} current={section} />
            <button
              type="button"
              onClick={() => {
                close()
                openOnboarding()
              }}
              className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:mt-auto"
            >
              <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
              How Humanity works
            </button>
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:px-5">
            <View />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionList({
  query,
  current,
}: {
  readonly query: string
  readonly current: SettingsSection
}) {
  const sections = matchSections(query)
  if (sections.length === 0) {
    return <p className="min-w-0 flex-1 px-2 text-xs text-muted-foreground">No settings match.</p>
  }
  return (
    <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:flex-none md:flex-col md:overflow-visible">
      {sections.map((id) => {
        const { icon: Icon } = SECTION_VIEWS[id]
        const active = id === current
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => openSettings(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 w-full items-center gap-3 rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted",
                active && "bg-muted",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {SECTION_INFO[id].label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
