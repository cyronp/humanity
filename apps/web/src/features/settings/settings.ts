import { useSyncExternalStore } from "react"


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
    readonly keywords: ReadonlyArray<string>
  }
> = {
  general: {
    label: "General",
    keywords: ["theme", "appearance", "dark mode", "light mode", "system"],
  },
  providers: {
    label: "Providers",
    keywords: [
      "accounts",
      "claude code",
      "codex",
      "chatgpt",
      "login",
      "sign in",
      "subscription",
      "plan",
      "api key",
    ],
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
