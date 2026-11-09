/**
 * Where a hunk stands in review. `"edited"` is reserved for post-MVP: a hunk
 * whose lines the human rewrote before approving it.
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

/** A hunk under review. */
export interface Hunk extends DiffHunk {
  readonly id: string
  readonly status: HunkStatus
  readonly comment?: string | undefined
  // post-MVP: readonly editedLines?: ReadonlyArray<string>
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

export type ReviewOutcome = "applied" | "partially_applied" | "rejected"

/** The human's verdict on a single hunk. */
export interface HunkDecision {
  readonly index: number
  readonly decision: "approved" | "rejected"
  readonly comment?: string | undefined
}
