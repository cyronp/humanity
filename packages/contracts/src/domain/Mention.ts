import { Schema } from "effect"

export const MENTION_LIMIT = 100

export const FileMentions = Schema.Array(Schema.String)
export type FileMentions = typeof FileMentions.Type

export interface MentionToken {
  readonly start: number
  readonly end: number
  readonly path: string
}

const MENTION = /(^|\s)@(?:"([^"\n]+)"|([^\s@"]+))/g
const TRAILING = /[.,;:!?)\]}'"]+$/

export const mentionTokens = (text: string, mentions: ReadonlySet<string>): Array<MentionToken> => {
  const tokens: Array<MentionToken> = []
  if (mentions.size === 0) return tokens
  for (const match of text.matchAll(MENTION)) {
    const start = match.index + (match[1] ?? "").length
    const quoted = match[2]
    if (quoted !== undefined) {
      if (mentions.has(quoted)) tokens.push({ start, end: start + 3 + quoted.length, path: quoted })
      continue
    }
    const raw = match[3] ?? ""
    const path = mentions.has(raw) ? raw : raw.replace(TRAILING, "")
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
