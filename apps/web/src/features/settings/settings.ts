import { useSyncExternalStore } from "react"

/**
 * The app's settings, shown as a dialog over whatever page is open, so
 * changing one never loses the place in a thread. It opens from the sidebar
 * and from anywhere that points at a setting.
 */

export const SETTINGS_SECTIONS = [
  "general",
  "providers",
  "mcp",
  "skills",
  "projects",
  "repositories",
  "updates",
  "about",
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** The sections as the list shows them, a line between each group: General, the named ones, then the app itself. */
export const SECTION_GROUPS: ReadonlyArray<{
  readonly label?: string
  readonly sections: ReadonlyArray<SettingsSection>
}> = [
  { sections: ["general"] },
  { label: "Agent", sections: ["providers", "mcp", "skills"] },
  { label: "Source Control", sections: ["projects", "repositories"] },
  { sections: ["updates", "about"] },
]

export const SECTION_INFO: Record<
  SettingsSection,
  {
    readonly label: string
    /** Other words a human may search this section by. */
    readonly keywords: ReadonlyArray<string>
  }
> = {
  general: {
    label: "General",
    keywords: ["theme", "appearance", "dark mode", "light mode", "system"],
  },
  providers: {
    label: "Providers",
    keywords: ["accounts", "claude code", "login", "sign in", "subscription", "plan", "api key"],
  },
  repositories: {
    label: "Repositories",
    keywords: ["github", "gitlab", "gh", "glab", "cli", "token", "clone", "sign in", "self-hosted"],
  },
  projects: {
    label: "Projects",
    keywords: ["permissions", "autonomy", "auto mode", "new threads", "remove", "folder"],
  },
  mcp: {
    label: "MCP",
    keywords: ["model context protocol", "servers", "tools", "integrations", "extensions"],
  },
  skills: {
    label: "Skills",
    keywords: ["slash commands", "instructions", "know-how", "extensions"],
  },
  updates: {
    label: "Updates",
    keywords: ["version", "upgrade", "nightly", "stable", "release", "download", "install"],
  },
  about: {
    label: "About",
    keywords: ["version", "release", "onboarding", "help", "how humanity works", "tour"],
  },
}

/** The sections a search shows: every one for an empty query, else those named or described by it. */
export const matchSections = (query: string): ReadonlyArray<SettingsSection> => {
  const needle = query.trim().toLowerCase()
  if (needle === "") return SETTINGS_SECTIONS
  return SETTINGS_SECTIONS.filter((section) => {
    const { label, keywords } = SECTION_INFO[section]
    return [label, ...keywords].some((word) => word.toLowerCase().includes(needle))
  })
}

interface SettingsState {
  readonly open: boolean
  readonly section: SettingsSection
  /** The item last picked in each section's list: a provider, a repository service, a project. */
  readonly items: Partial<Record<SettingsSection, string>>
}

let state: SettingsState = { open: false, section: "general", items: {} }
const listeners = new Set<() => void>()

const setState = (next: SettingsState): void => {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the settings at a section, or at the one shown last, and optionally at one of its items. */
export const openSettings = (section: SettingsSection = state.section, item?: string): void =>
  setState({
    open: true,
    section,
    items: item === undefined ? state.items : { ...state.items, [section]: item },
  })

export const closeSettings = (): void => setState({ ...state, open: false })

export const selectSettingsItem = (section: SettingsSection, item: string): void =>
  setState({ ...state, items: { ...state.items, [section]: item } })

export const useSettings = (): SettingsState => useSyncExternalStore(subscribe, () => state)
