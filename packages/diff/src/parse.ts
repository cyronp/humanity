import { parsePatch } from "diff"
import type { DiffHunk, FileDiff, FileDiffKind } from "./types.ts"

const NULL_FILE = "/dev/null"

/** `a/src/x.ts` → `src/x.ts`; quoted and timestamped names are cleaned too. */
const cleanFileName = (name: string | undefined): string | undefined => {
  if (name === undefined) return undefined
  let cleaned = name.split("\t")[0]?.trim() ?? ""
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1)
  if (cleaned === NULL_FILE) return NULL_FILE
  return cleaned.replace(/^[ab]\//, "")
}

/**
 * Parses unified diff text (for example `git diff --no-color`) into per-file
 * hunks with the same shape used for reviews, so one hunk view renders both.
 */
export const parseUnifiedDiff = (text: string): Array<FileDiff> => {
  if (text.trim() === "") return []
  return parsePatch(text).flatMap((patch): Array<FileDiff> => {
    const oldName = cleanFileName(patch.oldFileName)
    const newName = cleanFileName(patch.newFileName)
    const filePath = newName !== undefined && newName !== NULL_FILE ? newName : oldName
    if (filePath === undefined || filePath === NULL_FILE) return []

    const kind: FileDiffKind =
      patch.isCreate === true || oldName === NULL_FILE
        ? "create"
        : patch.isDelete === true || newName === NULL_FILE
          ? "delete"
          : patch.isRename === true
            ? "rename"
            : "modify"

    const hunks: Array<DiffHunk> = patch.hunks.map((hunk, position) => ({
      index: position + 1,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines,
    }))

    return [
      {
        filePath,
        ...(kind === "rename" && oldName !== undefined && oldName !== filePath
          ? { previousPath: oldName }
          : {}),
        kind,
        binary: patch.isBinary === true,
        hunks,
      },
    ]
  })
}
