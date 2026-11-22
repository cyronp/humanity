import { Schema } from "effect"
import { ProjectId } from "./Project.ts"
import { SessionId } from "./Session.ts"

export const SearchHitKind = Schema.Literals(["human", "agent", "tool"])
export type SearchHitKind = typeof SearchHitKind.Type

export const MessageHit = Schema.Struct({
  sessionId: SessionId,
  projectId: ProjectId,
  messageId: Schema.String,
  kind: SearchHitKind,
  snippet: Schema.String,
  createdAt: Schema.String,
})
export type MessageHit = typeof MessageHit.Type

export const SEARCH_MARK_START = "\u0002"
export const SEARCH_MARK_END = "\u0003"
export const SEARCH_MIN_LENGTH = 3
export const SEARCH_LIMIT = 50

export interface SnippetPart {
  readonly text: string
  readonly marked: boolean
}

export const snippetParts = (snippet: string): ReadonlyArray<SnippetPart> => {
  const parts: Array<SnippetPart> = []
  let rest = snippet
  while (rest !== "") {
    const start = rest.indexOf(SEARCH_MARK_START)
    if (start === -1) {
      parts.push({ text: rest, marked: false })
      break
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), marked: false })
    const end = rest.indexOf(SEARCH_MARK_END, start + 1)
    const stop = end === -1 ? rest.length : end
    parts.push({ text: rest.slice(start + 1, stop), marked: true })
    rest = end === -1 ? "" : rest.slice(end + 1)
  }
  return parts.filter((part) => part.text !== "")
}
