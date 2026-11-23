import { useSyncExternalStore } from "react"

export const SETTINGS_SECTIONS = [
  "general",
  "chat",
  "editor",
  "terminal",
  "browser",
  "providers",
  "tools",
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
  { sections: ["general", "chat", "editor", "terminal", "browser"] },
  { label: "Agent", sections: ["providers", "tools", "mcp", "skills"] },
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
    keywords: [
      "theme",
      "appearance",
      "dark mode",
      "light mode",
      "system",
      "color scheme",
      "color theme",
      "colors",
      "palette",
      "interface size",
      "zoom",
      "scale",
      "code theme",
      "syntax",
      "notifications",
      "sound",
      "alerts",
    ],
  },
  chat: {
    label: "Chat",
    keywords: [
      "new threads",
      "default model",
      "reasoning effort",
      "permissions",
      "autonomy",
      "composer",
      "enter",
      "send",
      "thinking",
      "tool calls",
      "expanded",
    ],
  },
  editor: {
    label: "Editor",
    keywords: [
      "files",
      "code",
      "auto save",
      "autosave",
      "save",
      "font",
      "font size",
      "tab size",
      "tabs",
      "spaces",
      "indentation",
      "word wrap",
      "wrap",
      "line numbers",
      "icons",
      "file icons",
    ],
  },
  terminal: {
    label: "Terminal",
    keywords: [
      "shell",
      "powershell",
      "bash",
      "zsh",
      "fish",
      "font",
      "font size",
      "line height",
      "cursor",
      "scrollback",
      "console",
      "copy",
      "paste",
      "gpu",
      "webgl",
      "shell integration",
    ],
  },
  browser: {
    label: "Browser",
    keywords: [
      "preview",
      "localhost",
      "links",
      "web",
      "devices",
      "zoom",
      "appearance",
      "cookies",
      "cache",
      "recordings",
    ],
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
      "cli path",
      "executable",
      "history",
      "import",
    ],
  },
  tools: {
    label: "Tools",
    keywords: ["humanity tools", "terminals", "open thread", "tokens", "context", "mcp"],
  },
  repositories: {
    label: "Repositories",
    keywords: [
      "github",
      "gitlab",
      "gh",
      "glab",
      "cli",
      "token",
      "clone",
      "sign in",
      "self-hosted",
      "fetch",
      "sync",
    ],
  },
  projects: {
    label: "Projects",
    keywords: [
      "permissions",
      "autonomy",
      "auto mode",
      "new threads",
      "remove",
      "folder",
      "rename",
      "worktree",
      "setup script",
      "branch prefix",
      "merge",
      "pull request",
      "draft",
      "default model",
    ],
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
    keywords: [
      "version",
      "release",
      "onboarding",
      "help",
      "how humanity works",
      "tour",
      "data folder",
      "diagnostics",
      "report an issue",
      "docs",
    ],
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
  readonly focus?: { readonly label: string; readonly nonce: number } | undefined
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

let focusNonce = 0

export const openSetting = (section: SettingsSection, label: string): void =>
  setState({ ...state, open: true, section, focus: { label, nonce: ++focusNonce } })

export const closeSettings = (): void => setState({ ...state, open: false, focus: undefined })

export const selectSettingsItem = (section: SettingsSection, item: string): void =>
  setState({ ...state, items: { ...state.items, [section]: item } })

export const useSettings = (): SettingsState => useSyncExternalStore(subscribe, () => state)
