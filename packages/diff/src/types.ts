export type HunkStatus = "pending" | "approved" | "rejected"

export interface DiffHunk {
  readonly index: number
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly lines: ReadonlyArray<string>
}

export interface Hunk extends DiffHunk {
  readonly id: string
  readonly status: HunkStatus
  readonly comment?: string
}

export type ChangeKind = "create" | "modify"

export type FileDiffKind = "create" | "modify" | "delete" | "rename"

export interface FileDiff {
  readonly filePath: string
  readonly previousPath?: string | undefined
  readonly kind: FileDiffKind
  readonly binary: boolean
  readonly hunks: ReadonlyArray<DiffHunk>
}
