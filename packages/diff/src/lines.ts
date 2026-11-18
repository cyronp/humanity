import type { DiffHunk } from "./types.ts"

export type DiffLineKind = "context" | "add" | "remove" | "meta"

export interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
  readonly oldNumber?: number
  readonly newNumber?: number
}

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

export const lineReference = (filePath: string, line: DiffLine): string | undefined => {
  if (line.newNumber !== undefined) return `${filePath}:${line.newNumber}`
  if (line.oldNumber !== undefined) return `${filePath}:${line.oldNumber} (removed line)`
  return undefined
}

const span = (start: number, lines: number) =>
  lines === 1 ? `${start}` : `${start}-${start + lines - 1}`

export const hunkReference = (filePath: string, hunk: DiffHunk): string =>
  hunk.newLines > 0
    ? `${filePath}:${span(hunk.newStart, hunk.newLines)}`
    : `${filePath}:${span(hunk.oldStart, hunk.oldLines)} (removed lines)`

export const currentLineNumbers = (rows: ReadonlyArray<DiffLine>): Array<number | undefined> => {
  const kept = rows.map((row) => row.newNumber)
  return rows.map((row, position) => {
    if (row.newNumber !== undefined) return row.newNumber
    if (row.kind !== "remove") return undefined
    const next = kept.slice(position + 1).find((number) => number !== undefined)
    if (next !== undefined) return next
    const previous = kept.slice(0, position).findLast((number) => number !== undefined)
    return previous === undefined ? undefined : previous + 1
  })
}
