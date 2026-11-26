import type { FileDiff } from "@humanity/contracts"
import { toDiffLines } from "@humanity/diff"
import { useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import { registry } from "@/lib/registry"

export type CommentSide = "new" | "old"

export interface CommentAnchor {
  readonly path: string
  readonly side: CommentSide
  readonly line: number
  readonly lineText: string
}

export interface ReviewComment extends CommentAnchor {
  readonly id: string
  readonly body: string
}

const QUOTE_LIMIT = 200

const storageKey = (sessionId: string) => `humanity.reviewComments.${sessionId}`

const isComment = (value: unknown): value is ReviewComment => {
  if (typeof value !== "object" || value === null) return false
  const fields = value as Record<string, unknown>
  return (
    typeof fields["id"] === "string" &&
    typeof fields["path"] === "string" &&
    (fields["side"] === "new" || fields["side"] === "old") &&
    typeof fields["line"] === "number" &&
    typeof fields["lineText"] === "string" &&
    typeof fields["body"] === "string"
  )
}

const read = (sessionId: string): ReadonlyArray<ReviewComment> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(sessionId)) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isComment) : []
  } catch {
    return []
  }
}

const write = (sessionId: string, comments: ReadonlyArray<ReviewComment>) => {
  try {
    if (comments.length === 0) localStorage.removeItem(storageKey(sessionId))
    else localStorage.setItem(storageKey(sessionId), JSON.stringify(comments))
  } catch {}
}

const commentsAtom = Atom.family((sessionId: string) =>
  Atom.writable(
    () => read(sessionId),
    (ctx, next: ReadonlyArray<ReviewComment>) => {
      write(sessionId, next)
      ctx.setSelf(next)
    },
  ).pipe(Atom.keepAlive),
)

const current = (sessionId: string) => registry.get(commentsAtom(sessionId))

const set = (sessionId: string, next: ReadonlyArray<ReviewComment>) =>
  registry.set(commentsAtom(sessionId), next)

export const pendingChangeKey = (changeId: string) => `change-${changeId}`

export const reviewComments = (sessionId: string) => ({
  add: (anchor: CommentAnchor, body: string) =>
    set(sessionId, [...current(sessionId), { ...anchor, id: crypto.randomUUID(), body }]),
  addAll: (comments: ReadonlyArray<ReviewComment>) =>
    set(sessionId, [
      ...current(sessionId),
      ...comments.map((comment) => ({ ...comment, id: crypto.randomUUID() })),
    ]),
  update: (id: string, body: string) =>
    set(
      sessionId,
      current(sessionId).map((comment) => (comment.id === id ? { ...comment, body } : comment)),
    ),
  remove: (id: string) =>
    set(
      sessionId,
      current(sessionId).filter((comment) => comment.id !== id),
    ),
  clear: () => set(sessionId, []),
})

export const useReviewComments = (sessionId: string): ReadonlyArray<ReviewComment> =>
  useAtomValue(commentsAtom(sessionId))

export const sameAnchor = (comment: CommentAnchor, anchor: CommentAnchor): boolean =>
  comment.path === anchor.path && comment.side === anchor.side && comment.line === anchor.line

const quote = (text: string) => {
  const line = text.replace(/\s+$/, "")
  return line.length > QUOTE_LIMIT ? `${line.slice(0, QUOTE_LIMIT)}…` : line
}

const sortKey = (comment: ReviewComment) =>
  `${comment.path}\u0000${String(comment.line).padStart(8, "0")}`

export const formatReviewComments = (
  comments: ReadonlyArray<ReviewComment>,
  heading = `My review comments on the uncommitted changes (${comments.length}):`,
): string => {
  const sorted = [...comments].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const entries = sorted.map((comment) =>
    [
      `${comment.path}, ${comment.side === "old" ? "removed line" : "line"} ${comment.line}:`,
      `> ${quote(comment.lineText)}`,
      comment.body.trim(),
    ].join("\n"),
  )
  return [heading, ...entries].join("\n\n")
}

export const staleComments = (
  files: ReadonlyArray<FileDiff>,
  comments: ReadonlyArray<ReviewComment>,
): ReadonlySet<string> => {
  const present = new Set<string>()
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const row of toDiffLines(hunk)) {
        if (row.kind === "meta") continue
        const side = row.kind === "remove" ? "old" : "new"
        const line = side === "old" ? row.oldNumber : row.newNumber
        if (line !== undefined)
          present.add(`${file.filePath}\u0000${side}\u0000${line}\u0000${row.text}`)
      }
    }
  }
  return new Set(
    comments
      .filter(
        (comment) =>
          !present.has(
            `${comment.path}\u0000${comment.side}\u0000${comment.line}\u0000${comment.lineText}`,
          ),
      )
      .map((comment) => comment.id),
  )
}
