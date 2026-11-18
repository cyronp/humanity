import { type FileEntry, mentionTokens, unescapeQuoted } from "@humanity/contracts"
import type { PromptEdit } from "@/features/extensions/prompt"

export interface ActiveMention {
  readonly start: number
  readonly query: string
  readonly quoted: boolean
}

const QUOTED_MENTION = /(^|\s)@"((?:\\"|[^"\n])*)$/
const BARE_MENTION = /(^|\s)@(\S*)$/

export const findMention = (text: string, caret: number): ActiveMention | undefined => {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const quoted = QUOTED_MENTION.exec(before)
  if (quoted !== null) {
    const raw = quoted[2] ?? ""
    return { start: before.length - raw.length - 2, query: unescapeQuoted(raw), quoted: true }
  }
  const bare = BARE_MENTION.exec(before)
  if (bare === null) return undefined
  const query = bare[2] ?? ""
  return { start: before.length - query.length - 1, query, quoted: false }
}

export const mentionOf = (entry: FileEntry): string => {
  const path = entry.kind === "directory" ? `${entry.path}/` : entry.path
  return /\s/.test(path) || path.startsWith('"') ? `@"${path.replaceAll('"', '\\"')}"` : `@${path}`
}

export const completeMention = (
  text: string,
  mention: ActiveMention,
  caret: number,
  entry: FileEntry,
): PromptEdit => {
  const token = mentionOf(entry)
  const rest = text.slice(caret)
  const after = mention.quoted && rest.startsWith('"') ? rest.slice(1) : rest
  const open = entry.kind === "directory"
  const trail = open || /^\s/.test(after) ? "" : " "
  const head = `${text.slice(0, mention.start)}${token}${trail}`
  const caretAt = open
    ? head.length - (token.endsWith('"') ? 1 : 0)
    : trail !== ""
      ? head.length
      : head.length + 1
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
