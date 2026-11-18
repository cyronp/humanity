import { type FileEntry, RECENT_MENTION_LIMIT, trimTrailing } from "@humanity/contracts"

export const FILE_SEARCH_LIMIT = 30

const MATCH = 16
const SEGMENT_START = 10
const AFTER_SEPARATOR = 8
const CAMEL_CASE = 8
const IN_NAME = 4
const CONSECUTIVE = 5
const GAP_START = 3
const GAP_EXTEND = 1
const SEPARATOR_DROPPED = 2
const EXACT_NAME = 1000
const IN_FOLDER = 10_000
const RECENT = 40
const NONE = Number.NEGATIVE_INFINITY

export const parseFileList = (output: string): Array<string> => [
  ...new Set(output.split("\0").filter((path) => path !== "")),
]

interface IndexedEntry {
  readonly entry: FileEntry
  readonly key: string
  readonly text: string
  readonly lower: string
  readonly name: string
  readonly nameStart: number
  readonly depth: number
}

export interface FileIndex {
  readonly entries: ReadonlyArray<IndexedEntry>
}

const NON_ASCII = /[\u0080-￿]/

const compose = (text: string) => (NON_ASCII.test(text) ? text.normalize("NFC") : text)

const indexed = (path: string, kind: FileEntry["kind"]): IndexedEntry => {
  const text = compose(path)
  const lower = compose(text.toLowerCase())
  const nameStart = lower.lastIndexOf("/") + 1
  let depth = 1
  for (let index = 0; index < path.length; index++) if (path[index] === "/") depth++
  return {
    entry: { path, kind },
    key: kind === "directory" ? `${path}/` : path,
    text,
    lower,
    name: lower.slice(nameStart),
    nameStart,
    depth,
  }
}

export const indexFiles = (files: ReadonlyArray<string>): FileIndex => {
  const directories = new Set<string>()
  for (const file of files) {
    let slash = file.lastIndexOf("/")
    while (slash > 0) {
      const directory = file.slice(0, slash)
      if (directories.has(directory)) break
      directories.add(directory)
      slash = directory.lastIndexOf("/")
    }
  }
  return {
    entries: [
      ...[...directories].map((path) => indexed(path, "directory")),
      ...files.map((path) => indexed(path, "file")),
    ],
  }
}

const isSeparatorCode = (code: number) => code === 45 || code === 95 || code === 32

const isSeparator = (char: string | undefined) =>
  char !== undefined && isSeparatorCode(char.charCodeAt(0))

const sameCode = (wanted: number, actual: number) =>
  wanted === actual || (isSeparatorCode(wanted) && isSeparatorCode(actual))

const isSubsequence = (needle: string, haystack: string) => {
  let at = 0
  for (let index = 0; index < haystack.length && at < needle.length; index++) {
    if (sameCode(needle.charCodeAt(at), haystack.charCodeAt(index))) at++
  }
  return at === needle.length
}

const isUpper = (code: number) => code >= 65 && code <= 90

const isLowerOrDigit = (code: number) => (code >= 97 && code <= 122) || (code >= 48 && code <= 57)

const boundaryBonus = (item: IndexedEntry, at: number) => {
  const previous = item.lower[at - 1]
  const bonus = at >= item.nameStart ? IN_NAME : 0
  if (at === 0 || previous === "/") return bonus + SEGMENT_START
  if (previous === "." || isSeparator(previous)) return bonus + AFTER_SEPARATOR
  const { text } = item
  if (
    text.length === item.lower.length &&
    isUpper(text.charCodeAt(at)) &&
    (isLowerOrDigit(text.charCodeAt(at - 1)) ||
      (isUpper(text.charCodeAt(at - 1)) && isLowerOrDigit(text.charCodeAt(at + 1))))
  ) {
    return bonus + CAMEL_CASE
  }
  return bonus
}

let previousRow = new Float64Array(256)
let currentRow = new Float64Array(256)

const fuzzy = (needle: string, item: IndexedEntry): number | undefined => {
  const { lower } = item
  const length = lower.length
  if (needle.length === 0) return 0
  if (needle.length > length || !isSubsequence(needle, lower)) return undefined
  if (previousRow.length < length) {
    previousRow = new Float64Array(length * 2)
    currentRow = new Float64Array(length * 2)
  }
  const last = needle.length - 1
  const first = needle.charCodeAt(0)
  previousRow.fill(NONE, 0, length)
  for (let at = 0; at < length - last; at++) {
    if (sameCode(first, lower.charCodeAt(at))) previousRow[at] = MATCH + boundaryBonus(item, at)
  }
  for (let query = 1; query <= last; query++) {
    const wanted = needle.charCodeAt(query)
    const end = length - (last - query)
    currentRow.fill(NONE, 0, length)
    let reach = NONE
    for (let at = query; at < end; at++) {
      const earlier = previousRow[at - 2]
      if (earlier !== undefined && earlier !== NONE) {
        reach = Math.max(reach, earlier + GAP_EXTEND * (at - 2))
      }
      if (!sameCode(wanted, lower.charCodeAt(at))) continue
      const adjacent = previousRow[at - 1]! + CONSECUTIVE
      const gapped = reach - GAP_START - GAP_EXTEND * (at - 2)
      const before = Math.max(adjacent, gapped)
      if (before !== NONE) currentRow[at] = before + MATCH + boundaryBonus(item, at)
    }
    const swap = previousRow
    previousRow = currentRow
    currentRow = swap
  }
  let best = NONE
  for (let at = last; at < length; at++) best = Math.max(best, previousRow[at]!)
  return best === NONE ? undefined : best
}

interface Query {
  readonly bare: string
  readonly folder: string | undefined
  readonly joined: string | undefined
}

const parseQuery = (query: string): Query => {
  const needle = compose(query.trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase())
  const bare = trimTrailing(needle, "/")
  const joined = bare.replace(/[-_ ]/g, "")
  return {
    bare,
    folder: needle.endsWith("/") ? needle : undefined,
    joined: joined !== bare && joined !== "" ? joined : undefined,
  }
}

const score = (item: IndexedEntry, query: Query): number | undefined => {
  if (query.bare === "") return 0
  if (query.folder !== undefined && `${item.lower}/`.startsWith(query.folder)) return IN_FOLDER
  const exact = item.name === query.bare ? EXACT_NAME : 0
  const plain = fuzzy(query.bare, item)
  const joined = query.joined === undefined ? undefined : fuzzy(query.joined, item)
  if (plain === undefined && joined === undefined) return undefined
  const dropped = query.bare.length - (query.joined?.length ?? query.bare.length)
  return (
    exact +
    Math.max(plain ?? NONE, joined === undefined ? NONE : joined - dropped * SEPARATOR_DROPPED)
  )
}

interface Ranked {
  readonly item: IndexedEntry
  readonly score: number
}

const compare = (a: Ranked, b: Ranked) =>
  b.score - a.score ||
  a.item.depth - b.item.depth ||
  (a.item.entry.kind === b.item.entry.kind ? 0 : a.item.entry.kind === "directory" ? -1 : 1) ||
  a.item.entry.path.length - b.item.entry.path.length ||
  (a.item.entry.path < b.item.entry.path ? -1 : a.item.entry.path > b.item.entry.path ? 1 : 0)

const recency = (recent: ReadonlyArray<string>) => {
  const bonus = new Map<string, number>()
  const kept = recent.slice(0, RECENT_MENTION_LIMIT)
  kept.forEach((path, at) => {
    if (!bonus.has(path))
      bonus.set(path, (RECENT * (RECENT_MENTION_LIMIT - at)) / RECENT_MENTION_LIMIT)
  })
  return bonus
}

export const searchIndex = (
  index: FileIndex,
  query: string,
  limit: number = FILE_SEARCH_LIMIT,
  recent: ReadonlyArray<string> = [],
): Array<FileEntry> => {
  if (limit <= 0) return []
  const parsed = parseQuery(query)
  const boost = recency(recent)
  const best: Array<Ranked> = []
  for (const item of index.entries) {
    const matched = score(item, parsed)
    if (matched === undefined) continue
    const candidate = { item, score: matched + (boost.get(item.key) ?? 0) }
    if (best.length === limit && compare(candidate, best[limit - 1]!) >= 0) continue
    let at = best.length
    while (at > 0 && compare(candidate, best[at - 1]!) < 0) at--
    best.splice(at, 0, candidate)
    if (best.length > limit) best.pop()
  }
  return best.map(({ item }) => item.entry)
}

export const searchFiles = (
  files: ReadonlyArray<string>,
  query: string,
  limit: number = FILE_SEARCH_LIMIT,
  recent: ReadonlyArray<string> = [],
): Array<FileEntry> => searchIndex(indexFiles(files), query, limit, recent)
