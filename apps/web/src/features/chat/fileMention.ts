import type { FileEntry } from "@humanity/contracts"
import type { PromptEdit } from "@/features/extensions/prompt"

/** An `@` being typed: where it starts in the text, and what follows it up to the caret. */
export interface ActiveMention {
  readonly start: number
  readonly query: string
}

/**
 * The `@` the caret is in, if any: one that starts the text or follows
 * whitespace, with no whitespace between it and the caret. An e-mail address
 * (`me@host`) is not one.
 */
export const findMention = (text: string, caret: number): ActiveMention | undefined => {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const match = /(^|\s)@([^\s@]*)$/.exec(before)
  if (match === null) return undefined
  const query = match[2] ?? ""
  return { start: before.length - query.length - 1, query }
}

/**
 * How a message names a file or folder: `@path`, quoted when the path holds
 * whitespace, so the agent reads it as one reference. A folder ends in `/`.
 */
export const mentionOf = (entry: FileEntry): string => {
  const path = entry.kind === "directory" ? `${entry.path}/` : entry.path
  return /\s/.test(path) ? `@"${path}"` : `@${path}`
}

/**
 * The text with the mention being typed replaced by `entry`'s. A file is
 * followed by a space, so typing goes on after it. A folder is not, so its
 * contents are offered next; one whose path needs quotes is closed off like a file.
 */
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
  // Past the space that was already there, as if it had been typed.
  const caretAt = open || trail !== "" ? head.length : head.length + 1
  return { text: `${head}${after}`, caret: caretAt }
}
