import type { BranchPublication, WorkingTreeDiff } from "@humanity/contracts"
import { readStored, writeStored, writeStoredJson } from "@/lib/storage"

export const SHELF_TOOLS = ["files", "git", "browser"] as const
export type ShelfTool = (typeof SHELF_TOOLS)[number]

export const SHELF_LABELS: Readonly<Record<ShelfTool, string>> = {
  files: "Files",
  git: "Source control",
  browser: "Browser",
}

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

export const readStoredShelf = (wide: boolean): ShelfState => {
  const stored = parseShelf(readStored(STORAGE_KEY))
  return wide ? stored : { ...stored, open: false }
}

export const storeShelf = (shelf: ShelfState) => writeStoredJson(STORAGE_KEY, shelf)

export const parseGitView = (raw: string | null): GitView =>
  GIT_VIEWS.find((view) => view === raw) ?? "overview"

export const readStoredGitView = (): GitView => parseGitView(readStored(GIT_VIEW_KEY))

export const storeGitView = (view: GitView) => writeStored(GIT_VIEW_KEY, view)

export const toggleTool = (shelf: ShelfState, tool: ShelfTool): ShelfState =>
  shelf.open && shelf.tool === tool ? { ...shelf, open: false } : { open: true, tool }

export interface ShelfBadge {
  readonly count: number
  readonly label: string
}

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
