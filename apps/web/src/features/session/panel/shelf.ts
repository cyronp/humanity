import type { BranchPublication, WorkingTreeDiff } from "@humanity/contracts"

/** The tools of the shelf on the right of a thread, in the order of its rail. */
export const SHELF_TOOLS = ["changes", "commits", "commit", "pull-request"] as const
export type ShelfTool = (typeof SHELF_TOOLS)[number]

export const SHELF_LABELS: Readonly<Record<ShelfTool, string>> = {
  changes: "Changes",
  commits: "Commits",
  commit: "Commit and push",
  "pull-request": "Pull request",
}

export interface ShelfState {
  readonly open: boolean
  readonly tool: ShelfTool
}

export const DEFAULT_SHELF: ShelfState = { open: false, tool: "changes" }

const STORAGE_KEY = "humanity.shelf"

const isTool = (value: unknown): value is ShelfTool => SHELF_TOOLS.some((tool) => tool === value)

export const parseShelf = (raw: string | null): ShelfState => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null")
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SHELF
    const { open, tool } = parsed as Record<string, unknown>
    return {
      open: open === true,
      tool: isTool(tool) ? tool : DEFAULT_SHELF.tool,
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

/** Clicking the open tool closes the shelf; any other tool opens on it. */
export const toggleTool = (shelf: ShelfState, tool: ShelfTool): ShelfState =>
  shelf.open && shelf.tool === tool ? { ...shelf, open: false } : { open: true, tool }

/** What each tool's rail icon shows without being opened, or nothing. */
export const shelfBadges = (
  diff: WorkingTreeDiff | undefined,
  publication: BranchPublication | undefined,
): Partial<Record<ShelfTool, number>> => {
  const badges: Partial<Record<ShelfTool, number>> = {}
  if (diff !== undefined && diff.files.length > 0) badges.changes = diff.files.length
  if (publication !== undefined && publication.upstream !== null && publication.ahead > 0) {
    badges.commit = publication.ahead
  }
  return badges
}
