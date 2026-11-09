import type { DiffHunk } from "./types.ts"

export type DiffLineKind = "context" | "add" | "remove" | "meta"

/** One rendered row of a hunk, with the line numbers a diff gutter shows. */
export interface DiffLine {
  readonly kind: DiffLineKind
  /** The line without its `+`/`-`/space prefix and without a trailing `\r`. */
  readonly text: string
  readonly oldNumber?: number
  readonly newNumber?: number
}

/**
 * Expands a hunk's raw unified-diff lines into rows. `\ No newline at end of
 * file` markers become `meta` rows; they carry no line number.
 */
export const toDiffLines = (hunk: DiffHunk): Array<DiffLine> => {
  let oldNumber = hunk.oldStart
  let newNumber = hunk.newStart
  return hunk.lines.map((line): DiffLine => {
    const prefix = line[0]
    const text = line.slice(1).replace(/\r$/, "")
    if (prefix === "+") return { kind: "add", text, newNumber: newNumber++ }
    if (prefix === "-") return { kind: "remove", text, oldNumber: oldNumber++ }
    if (prefix === "\\") return { kind: "meta", text: line.slice(2) }
    return { kind: "context", text, oldNumber: oldNumber++, newNumber: newNumber++ }
  })
}

/** Added and removed line counts, for one-line summaries. */
export const countChanges = (
  hunks: ReadonlyArray<DiffHunk>,
): { readonly added: number; readonly removed: number } => {
  let added = 0
  let removed = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) added++
      else if (line.startsWith("-")) removed++
    }
  }
  return { added, removed }
}
