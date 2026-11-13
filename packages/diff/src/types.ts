/**
 * Where the change a hunk belongs to stands. Every hunk of a change shares
 * it; hunks decided one by one only exist on changes from before that ended.
 */
export type HunkStatus = "pending" | "approved" | "rejected"

/** One contiguous change, exactly as a unified diff describes it. */
export interface DiffHunk {
  /** 1-based position within its file. Shown to the human and quoted to the agent. */
  readonly index: number
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  /** Unified diff lines with their `+`, `-` or space prefix. */
  readonly lines: ReadonlyArray<string>
}

/** A hunk of a file change the agent proposed. */
export interface Hunk extends DiffHunk {
  readonly id: string
  readonly status: HunkStatus
  /** Only on hunks from when each one was decided separately. */
  readonly comment?: string
}

export type ChangeKind = "create" | "modify"

export type FileDiffKind = "create" | "modify" | "delete" | "rename"

/** One file of a multi-file diff, for example from `git diff`. */
export interface FileDiff {
  readonly filePath: string
  readonly previousPath?: string | undefined
  readonly kind: FileDiffKind
  /** True when git reports a binary change; there are no hunks to show. */
  readonly binary: boolean
  readonly hunks: ReadonlyArray<DiffHunk>
}
