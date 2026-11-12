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

/**
 * How a message points the agent at one row of a diff: `path:line` in the
 * file as it is now. A removed line no longer has a place there, so it is
 * named by the number it had before the change, and says so.
 */
export const lineReference = (filePath: string, line: DiffLine): string | undefined => {
  if (line.newNumber !== undefined) return `${filePath}:${line.newNumber}`
  if (line.oldNumber !== undefined) return `${filePath}:${line.oldNumber} (removed line)`
  return undefined
}

const span = (start: number, lines: number) =>
  lines === 1 ? `${start}` : `${start}-${start + lines - 1}`

/**
 * How a message points the agent at a whole hunk: the lines it covers in the
 * file as it is now, or the old ones when the hunk only removed lines.
 */
export const hunkReference = (filePath: string, hunk: DiffHunk): string =>
  hunk.newLines > 0
    ? `${filePath}:${span(hunk.newStart, hunk.newLines)}`
    : `${filePath}:${span(hunk.oldStart, hunk.oldLines)} (removed lines)`
