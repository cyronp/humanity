import { cn } from "cn"
import {
  Blocks,
  FolderCog,
  FolderGit2,
  Info,
  Plug,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { type ComponentType, Fragment, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { McpIcon } from "@/features/extensions/McpIcon"
import { AboutSettings } from "./AboutSettings.tsx"
import { McpSettings, SkillSettings } from "./ExtensionsSettings.tsx"
import { GeneralSettings } from "./GeneralSettings.tsx"
import { ProjectsSettings } from "./ProjectsSettings.tsx"
import { ProvidersSettings } from "./ProvidersSettings.tsx"
import { RepositoriesSettings } from "./RepositoriesSettings.tsx"
import {
  closeSettings,
  matchSections,
  openSettings,
  SECTION_GROUPS,
  SECTION_INFO,
  type SettingsSection,
  useSettings,
} from "./settings.ts"
import { UpdatesSettings } from "./UpdatesSettings.tsx"

const SECTION_VIEWS: Record<
  SettingsSection,
  {
    readonly icon: ComponentType<{ readonly className?: string; readonly "aria-hidden"?: "true" }>
    readonly View: ComponentType
  }
> = {
  general: { icon: SlidersHorizontal, View: GeneralSettings },
  providers: { icon: Plug, View: ProvidersSettings },
  repositories: { icon: FolderGit2, View: RepositoriesSettings },
  projects: { icon: FolderCog, View: ProjectsSettings },
  mcp: { icon: McpIcon, View: McpSettings },
  skills: { icon: Blocks, View: SkillSettings },
  updates: { icon: RefreshCw, View: UpdatesSettings },
  about: { icon: Info, View: AboutSettings },
}

export function SettingsDialog() {
  const { open, section } = useSettings()
  const [query, setQuery] = useState("")
  const { View } = SECTION_VIEWS[section]
  const searchRef = useRef<HTMLInputElement>(null)

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
        showCloseButton={false}
        className="flex h-[min(50rem,var(--dialog-max-height))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(80rem,calc(100%-2rem))]"
        onEscapeKeyDown={(event) => {
          if (query === "") return
          event.preventDefault()
          setQuery("")
        }}
        onKeyDown={(event) => {
          if (event.key !== "/" || isTyping(event.target)) return
          event.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Humanity's settings.</DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 items-center gap-3 border-b p-3 md:w-60 md:flex-col md:items-stretch md:gap-2 md:overflow-y-auto md:border-r md:border-b-0"
          >
            <InputGroup className="hidden md:flex">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search settings"
              />
              {query === "" && (
                <InputGroupAddon align="inline-end">
                  <Kbd>/</Kbd>
                </InputGroupAddon>
              )}
            </InputGroup>
            <SectionList query={query} current={section} />
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
  const matched = matchSections(query)
  const groups = SECTION_GROUPS.map(({ label, sections }) => ({
    label,
    sections: sections.filter((id) => matched.includes(id)),
  })).filter((group) => group.sections.length > 0)
  if (groups.length === 0) {
    return <p className="min-w-0 flex-1 px-2 text-xs text-muted-foreground">No settings match.</p>
  }
  return (
    <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:flex-none md:flex-col md:overflow-visible">
      {groups.map(({ label, sections }, index) => (
        <Fragment key={sections[0]}>
          {index > 0 && (
            <li role="none" className="flex shrink-0 items-center px-1 md:hidden">
              <Separator orientation="vertical" className="h-5" />
            </li>
          )}
          {index > 0 && label === undefined && <li role="none" className="hidden h-3 md:block" />}
          {label !== undefined && (
            <li
              role="none"
              className="hidden px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground md:block"
            >
              {label}
            </li>
          )}
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
                    "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-muted font-medium text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {SECTION_INFO[id].label}
                </button>
              </li>
            )
          })}
        </Fragment>
      ))}
    </ul>
  )
}

const isTyping = (target: EventTarget): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
