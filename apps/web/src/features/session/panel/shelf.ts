import type { BranchPublication, WorkingTreeDiff } from "@humanity/contracts"

/** The tools of the shelf on the right of a thread, in the order of its rail. */
export const SHELF_TOOLS = ["git", "browser"] as const
export type ShelfTool = (typeof SHELF_TOOLS)[number]

export const SHELF_LABELS: Readonly<Record<ShelfTool, string>> = {
  git: "Source control",
  browser: "Browser",
}

/** The tabs of the Source control tool. */
export const GIT_VIEWS = ["overview", "changes", "commits", "checks"] as const
export type GitView = (typeof GIT_VIEWS)[number]

export const GIT_VIEW_LABELS: Readonly<Record<GitView, string>> = {
  overview: "Overview",
  changes: "Changes",
  commits: "Commits",
  checks: "Checks",
}

export interface ShelfState {
  readonly open: boolean
  readonly tool: ShelfTool
}

export const DEFAULT_SHELF: ShelfState = { open: false, tool: "git" }

const STORAGE_KEY = "humanity.shelf"
const GIT_VIEW_KEY = "humanity.git-view"

const isTool = (value: unknown): value is ShelfTool => SHELF_TOOLS.some((tool) => tool === value)

/** The git tools the rail had before they became tabs of Source control. */
const FORMER_GIT_TOOLS: ReadonlyArray<unknown> = ["changes", "commits", "commit", "pull-request"]

export const parseShelf = (raw: string | null): ShelfState => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null")
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SHELF
    const { open, tool } = parsed as Record<string, unknown>
    return {
      open: open === true,
      tool: isTool(tool) ? tool : FORMER_GIT_TOOLS.includes(tool) ? "git" : DEFAULT_SHELF.tool,
    }
  } catch {
    return DEFAULT_SHELF
  }
}

/**
 * The shelf as the human last left it. On a window too narrow to show it beside the chat it starts
 * closed, so opening a thread shows the thread.
 */
export const readStoredShelf = (wide: boolean): ShelfState => {
  try {
    const stored = parseShelf(localStorage.getItem(STORAGE_KEY))
    return wide ? stored : { ...stored, open: false }
  } catch {
    return DEFAULT_SHELF
  }
}

export const storeShelf = (shelf: ShelfState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shelf))
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the shelf still works.
  }
}

export const parseGitView = (raw: string | null): GitView =>
  GIT_VIEWS.find((view) => view === raw) ?? "overview"

export const readStoredGitView = (): GitView => {
  try {
    return parseGitView(localStorage.getItem(GIT_VIEW_KEY))
  } catch {
    return "overview"
  }
}

export const storeGitView = (view: GitView) => {
  try {
    localStorage.setItem(GIT_VIEW_KEY, view)
  } catch {
    // As above: the tab is only remembered when storage works.
  }
}

/** Clicking the open tool closes the shelf; any other tool opens on it. */
export const toggleTool = (shelf: ShelfState, tool: ShelfTool): ShelfState =>
  shelf.open && shelf.tool === tool ? { ...shelf, open: false } : { open: true, tool }

export interface ShelfBadge {
  readonly count: number
  /** What the count is, for the icon's tooltip. */
  readonly label: string
}

/**
 * What each tool's rail icon shows without being opened, or nothing. Source control counts the
 * changed files, else the commits waiting for a push.
 */
export const shelfBadges = (
  diff: WorkingTreeDiff | undefined,
  publication: BranchPublication | undefined,
): Partial<Record<ShelfTool, ShelfBadge>> => {
  if (diff !== undefined && diff.files.length > 0) {
    return { git: { count: diff.files.length, label: `${diff.files.length} changed` } }
  }
  if (publication !== undefined && publication.upstream !== null && publication.ahead > 0) {
    return { git: { count: publication.ahead, label: `${publication.ahead} to push` } }
  }
  return {}
}
