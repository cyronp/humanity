import { useSyncExternalStore } from "react"

/**
 * The app's settings, shown as a dialog over whatever page is open, so
 * changing one never loses the place in a thread. It opens from the sidebar
 * and from anywhere that points at a setting.
 */

export const SETTINGS_SECTIONS = ["providers", "repositories", "projects", "extensions"] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SECTION_INFO: Record<
  SettingsSection,
  {
    readonly label: string
    /** Other words a human may search this section by. */
    readonly keywords: ReadonlyArray<string>
  }
> = {
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
  extensions: {
    label: "MCP & Skills",
    keywords: [
      "mcp",
      "servers",
      "skills",
      "slash commands",
      "plugins",
      "integrations",
      "extensions",
    ],
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
}

let state: SettingsState = { open: false, section: "providers" }
const listeners = new Set<() => void>()

const setState = (next: SettingsState): void => {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the settings at a section, or at the one shown last. */
export const openSettings = (section: SettingsSection = state.section): void =>
  setState({ open: true, section })

export const closeSettings = (): void => setState({ ...state, open: false })

export const useSettings = (): SettingsState => useSyncExternalStore(subscribe, () => state)
