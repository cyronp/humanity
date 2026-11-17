import type { FileEntry } from "@humanity/contracts"
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

const MENTION = /(^|\s)@(?:"([^"\n]+)"|([^\s@"]+))/g
const TRAILING = /[.,;:!?)\]}'"]+$/

const FILE_EXTENSIONS = new Set(
  (
    "ts mts cts tsx js mjs cjs jsx json jsonc json5 css scss sass less html htm md mdx txt rst " +
    "py pyi go rs php rb kt kts swift c h cpp cc cxx hpp hh m mm java scala lua dart vue svelte " +
    "astro graphql gql zig ex exs erl hs ml fs cs vb r jl pl sh bash zsh fish ps1 bat cmd " +
    "yml yaml toml ini cfg conf env xml plist csv tsv log sql db sqlite sqlite3 prisma proto " +
    "lock svg png jpg jpeg gif webp ico bmp pdf wasm gradle tf hcl nix"
  ).split(" "),
)

const FILE_NAMES = new Set([
  "makefile",
  "dockerfile",
  "containerfile",
  "license",
  "licence",
  "readme",
  "changelog",
  "contributing",
  "codeowners",
  "notice",
  "authors",
  "procfile",
  "gemfile",
  "rakefile",
  "jenkinsfile",
  "vagrantfile",
  "brewfile",
  "justfile",
])

export const looksLikePath = (path: string): boolean => {
  if (path.includes("/")) return true
  const name = path.toLowerCase()
  if (FILE_NAMES.has(name)) return true
  const dot = name.lastIndexOf(".")
  if (dot === -1 || dot === name.length - 1) return false
  return dot === 0 || FILE_EXTENSIONS.has(name.slice(dot + 1))
}

export const splitMentions = (text: string): ReadonlyArray<MentionSegment> => {
  const segments: Array<MentionSegment> = []
  let from = 0
  const push = (until: number) => {
    if (until > from) segments.push({ kind: "text", text: text.slice(from, until) })
  }
  for (const match of text.matchAll(MENTION)) {
    const quoted = match[2]
    const bare = (match[3] ?? "").replace(TRAILING, "")
    const path = quoted ?? bare
    if (path === "" || (quoted === undefined && !looksLikePath(bare))) continue
    const start = match.index + (match[1] ?? "").length
    const end = quoted === undefined ? start + 1 + bare.length : start + 3 + quoted.length
    push(start)
    segments.push({ kind: "file", text: text.slice(start, end), path })
    from = end
  }
  push(text.length)
  return segments
}
