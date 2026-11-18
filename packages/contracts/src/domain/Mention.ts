import { Schema } from "effect"
import { trimTrailing } from "../text.ts"

export const MENTION_LIMIT = 100
export const RECENT_MENTION_LIMIT = 50

export const FileMentions = Schema.Array(Schema.String)
export type FileMentions = typeof FileMentions.Type

export interface MentionToken {
  readonly start: number
  readonly end: number
  readonly path: string
}

const MENTION = /(^|\s)@(?:"((?:\\"|[^"\n])+)"|([^\s"]\S*))/g
const TRAILING = ".,;:!?)]}'\""

export const unescapeQuoted = (quoted: string): string => quoted.replaceAll('\\"', '"')

export const mentionTokens = (text: string, mentions: ReadonlySet<string>): Array<MentionToken> => {
  const tokens: Array<MentionToken> = []
  if (mentions.size === 0) return tokens
  for (const match of text.matchAll(MENTION)) {
    const start = match.index + (match[1] ?? "").length
    if (match[2] !== undefined) {
      const path = unescapeQuoted(match[2])
      if (mentions.has(path)) tokens.push({ start, end: match.index + match[0].length, path })
      continue
    }
    const raw = match[3] ?? ""
    const path = mentions.has(raw) ? raw : trimTrailing(raw, TRAILING)
    if (path !== "" && mentions.has(path)) {
      tokens.push({ start, end: start + 1 + path.length, path })
    }
  }
  return tokens
}

export const mentionedPaths = (text: string, mentions: Iterable<string>): Array<string> =>
  [...new Set(mentionTokens(text, new Set(mentions)).map((token) => token.path))].slice(
    0,
    MENTION_LIMIT,
  )
