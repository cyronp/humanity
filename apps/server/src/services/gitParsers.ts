import type { Branch, RepoStatus, StatusEntry, StatusEntryKind } from "@humanity/contracts"

/** Field separator used in `--format` strings; it cannot occur in ref names or subjects. */
export const FIELD = "\u001f"

export const BRANCH_FORMAT = [
  "%(refname)",
  "%(refname:short)",
  "%(HEAD)",
  "%(upstream:short)",
  "%(objectname:short)",
  "%(contents:subject)",
  "%(authorname)",
  "%(committerdate:iso-strict)",
  "%(upstream:track,nobracket)",
].join(FIELD)

/** `ahead 2, behind 1`, `ahead 3`, `gone` or empty, as `%(upstream:track,nobracket)` prints it. */
const trackCount = (track: string, word: "ahead" | "behind") =>
  Number(new RegExp(`${word} (\\d+)`).exec(track)?.[1] ?? 0)

/** Parses `git branch --all --format=<BRANCH_FORMAT>`. */
export const parseBranches = (output: string): Array<Branch> =>
  output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line): Array<Branch> => {
      const [
        refname = "",
        name = "",
        head = "",
        upstream = "",
        commit = "",
        subject = "",
        author = "",
        committedAt = "",
        track = "",
      ] = line.split(FIELD)
      // `origin/HEAD` is a pointer to the remote's default branch, not a branch.
      if (refname.endsWith("/HEAD") || name === "" || name.startsWith("(")) return []
      return [
        {
          name,
          isCurrent: head === "*",
          isRemote: refname.startsWith("refs/remotes/"),
          upstream: upstream === "" ? null : upstream,
          commit,
          subject,
          author,
          committedAt,
          ahead: trackCount(track, "ahead"),
          behind: trackCount(track, "behind"),
        },
      ]
    })

const kindFromCodes = (index: string, worktree: string): StatusEntryKind => {
  const codes = index + worktree
  if (codes.includes("R")) return "renamed"
  if (codes.includes("C")) return "copied"
  if (codes.includes("A")) return "added"
  if (codes.includes("D")) return "deleted"
  if (codes.includes("T")) return "type_changed"
  return "modified"
}

/**
 * Parses `git status --porcelain=v2 --branch -z`. With `-z` records end in NUL
 * and paths are never quoted; a rename record is followed by one extra NUL
 * field holding the original path.
 */
export const parseStatus = (output: string): RepoStatus => {
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const entries: Array<StatusEntry> = []

  const records = output.split("\0")
  for (let i = 0; i < records.length; i++) {
    const record = records[i] ?? ""
    if (record === "") continue

    if (record.startsWith("# ")) {
      const [, key = "", ...rest] = record.split(" ")
      const value = rest.join(" ")
      if (key === "branch.head") branch = value === "(detached)" ? null : value
      else if (key === "branch.upstream") upstream = value
      else if (key === "branch.ab") {
        const match = /^\+(\d+) -(\d+)$/.exec(value)
        if (match) {
          ahead = Number(match[1])
          behind = Number(match[2])
        }
      }
      continue
    }

    const type = record[0]
    if (type === "?") {
      entries.push({ path: record.slice(2), kind: "untracked", staged: false, unstaged: true })
    } else if (type === "1" || type === "2") {
      // 1 XY sub mH mI mW hH hI path            (8 fields before the path)
      // 2 XY sub mH mI mW hH hI Xscore path     (9 fields before the path)
      const fieldsBeforePath = type === "1" ? 8 : 9
      const parts = record.split(" ")
      const xy = parts[1] ?? ".."
      const index = xy[0] ?? "."
      const worktree = xy[1] ?? "."
      const path = parts.slice(fieldsBeforePath).join(" ")
      const previousPath = type === "2" ? records[++i] : undefined
      entries.push({
        path,
        ...(previousPath ? { previousPath } : {}),
        kind: kindFromCodes(index, worktree),
        staged: index !== ".",
        unstaged: worktree !== ".",
      })
    } else if (type === "u") {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path      (10 fields before the path)
      entries.push({
        path: record.split(" ").slice(10).join(" "),
        kind: "conflicted",
        staged: false,
        unstaged: true,
      })
    }
    // "!" (ignored) records are not requested and are skipped if present.
  }

  return { branch, upstream, ahead, behind, entries }
}

export interface Worktree {
  readonly path: string
  readonly head: string | undefined
  /** Short branch name, or `undefined` when detached. */
  readonly branch: string | undefined
}

/** Parses `git worktree list --porcelain`: blank-line separated attribute blocks. */
export const parseWorktrees = (output: string): Array<Worktree> =>
  output
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .flatMap((block): Array<Worktree> => {
      const attributes = new Map(
        block.split(/\r?\n/).map((line) => {
          const space = line.indexOf(" ")
          return space === -1 ? [line, ""] : [line.slice(0, space), line.slice(space + 1)]
        }),
      )
      const path = attributes.get("worktree")
      if (path === undefined) return []
      return [
        {
          path,
          head: attributes.get("HEAD"),
          branch: attributes.get("branch")?.replace(/^refs\/heads\//, ""),
        },
      ]
    })
