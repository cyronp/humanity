import type { Branch, RepoStatus, StatusEntry, StatusEntryKind } from "@humanity/contracts"

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

export const RECORD = ""

/**
 * One commit of `git log`, as the server reads it: what `CommitSummary` shows, plus the author's
 * email, which only the server uses (to find the author's picture on the forge).
 */
export interface LoggedCommit {
  readonly hash: string
  readonly shortHash: string
  readonly subject: string
  readonly author: string
  readonly authorEmail: string
  readonly committedAt: string
  readonly files: number
  readonly insertions: number
  readonly deletions: number
}

/**
 * Each record starts with the separator, so the `--numstat` lines git prints after a commit's
 * fields stay in that commit's record. Numstat, unlike `--shortstat`, is never translated.
 */
export const LOG_FORMAT = RECORD + ["%H", "%h", "%s", "%an", "%ae", "%cI"].join(FIELD)

const NUMSTAT = /^(\d+|-)\t(\d+|-)\t/

export const parseLog = (output: string): Array<LoggedCommit> =>
  output
    .split(RECORD)
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [fields = "", ...stats] = record.split("\n")
      const [
        hash = "",
        shortHash = "",
        subject = "",
        author = "",
        authorEmail = "",
        committedAt = "",
      ] = fields.split(FIELD)
      let files = 0
      let insertions = 0
      let deletions = 0
      for (const line of stats) {
        const match = NUMSTAT.exec(line)
        if (match === null) continue
        files++
        insertions += match[1] === "-" ? 0 : Number(match[1])
        deletions += match[2] === "-" ? 0 : Number(match[2])
      }
      return {
        hash,
        shortHash,
        subject,
        author,
        authorEmail,
        committedAt,
        files,
        insertions,
        deletions,
      }
    })

const trackCount = (track: string, word: "ahead" | "behind") =>
  Number(new RegExp(`${word} (\\d+)`).exec(track)?.[1] ?? 0)

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
      entries.push({
        path: record.split(" ").slice(10).join(" "),
        kind: "conflicted",
        staged: false,
        unstaged: true,
      })
    }
  }

  return { branch, upstream, ahead, behind, entries }
}

export interface Worktree {
  readonly path: string
  readonly head: string | undefined
  readonly branch: string | undefined
}

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
