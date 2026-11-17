import { type FileEntry, mentionTokens } from "@humanity/contracts"
import type { PromptEdit } from "@/features/extensions/prompt"

export interface ActiveMention {
  readonly start: number
  readonly query: string
}

export const findMention = (text: string, caret: number): ActiveMention | undefined => {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const match = /(^|\s)@([^\s@]*)$/.exec(before)
  if (match === null) return undefined
  const query = match[2] ?? ""
  return { start: before.length - query.length - 1, query }
}

export const mentionOf = (entry: FileEntry): string => {
  const path = entry.kind === "directory" ? `${entry.path}/` : entry.path
  return /\s/.test(path) ? `@"${path}"` : `@${path}`
}

export const completeMention = (
  text: string,
  mention: ActiveMention,
  caret: number,
  entry: FileEntry,
): PromptEdit => {
  const token = mentionOf(entry)
  const after = text.slice(caret)
  const open = entry.kind === "directory" && !token.endsWith('"')
  const trail = open || /^\s/.test(after) ? "" : " "
  const head = `${text.slice(0, mention.start)}${token}${trail}`
  const caretAt = open || trail !== "" ? head.length : head.length + 1
  return { text: `${head}${after}`, caret: caretAt }
}

export type MentionSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "file"; readonly text: string; readonly path: string }

export const splitMentions = (
  text: string,
  mentions: ReadonlySet<string>,
): ReadonlyArray<MentionSegment> => {
  const segments: Array<MentionSegment> = []
  let from = 0
  for (const token of mentionTokens(text, mentions)) {
    if (token.start > from) segments.push({ kind: "text", text: text.slice(from, token.start) })
    segments.push({ kind: "file", text: text.slice(token.start, token.end), path: token.path })
    from = token.end
  }
  if (text.length > from) segments.push({ kind: "text", text: text.slice(from) })
  return segments
}
