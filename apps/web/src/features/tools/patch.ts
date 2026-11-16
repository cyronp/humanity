import { computeHunks, type DiffHunk, parseUnifiedDiff } from "@humanity/diff"
import { asRecord } from "./inputs.ts"

/** One file of a Codex patch (the `ApplyPatch` tool), with its diff as hunks. */
export interface PatchedFile {
  readonly path: string
  readonly kind: "add" | "delete" | "update"
  readonly movePath: string | undefined
  readonly hunks: ReadonlyArray<DiffHunk>
}

const hunksOf = (kind: PatchedFile["kind"], path: string, diff: string): Array<DiffHunk> => {
  // Codex gives a new or deleted file as its content, and a change as bare `@@` hunks.
  if (kind === "add" && !diff.startsWith("@@")) return computeHunks("", diff)
  if (kind === "delete" && !diff.startsWith("@@")) return computeHunks(diff, "")
  const headed = diff.startsWith("--- ") ? diff : `--- a/${path}\n+++ b/${path}\n${diff}`
  return parseUnifiedDiff(headed).flatMap((file) => file.hunks)
}

/** The files an `ApplyPatch` call changes, read from its input. Unreadable entries are left out. */
export const patchFiles = (input: unknown): Array<PatchedFile> => {
  const changes = asRecord(input)["changes"]
  if (!Array.isArray(changes)) return []
  return (changes as ReadonlyArray<unknown>).flatMap((change): Array<PatchedFile> => {
    const { path, kind, movePath, diff } = asRecord(change)
    if (typeof path !== "string" || path === "") return []
    const known = kind === "add" || kind === "delete" ? kind : "update"
    return [
      {
        path,
        kind: known,
        movePath: typeof movePath === "string" && movePath !== "" ? movePath : undefined,
        hunks: hunksOf(known, path, typeof diff === "string" ? diff : ""),
      },
    ]
  })
}
