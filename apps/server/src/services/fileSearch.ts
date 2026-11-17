import type { FileEntry } from "@humanity/contracts"

export const FILE_SEARCH_LIMIT = 30

export const parseFileList = (output: string): Array<string> => [
  ...new Set(output.split("\0").filter((path) => path !== "")),
]

interface IndexedEntry {
  readonly entry: FileEntry
  readonly lower: string
  readonly name: string
  readonly depth: number
}

export interface FileIndex {
  readonly entries: ReadonlyArray<IndexedEntry>
}

const indexed = (path: string, kind: FileEntry["kind"]): IndexedEntry => {
  const lower = path.toLowerCase()
  let depth = 1
  for (let index = 0; index < path.length; index++) if (path[index] === "/") depth++
  return {
    entry: { path, kind },
    lower,
    name: lower.slice(lower.lastIndexOf("/") + 1),
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

const isSubsequence = (needle: string, haystack: string) => {
  if (needle.length === 0) return true
  let at = 0
  for (let index = 0; index < haystack.length; index++) {
    if (haystack[index] === needle[at]) at++
    if (at === needle.length) return true
  }
  return false
}

const score = (item: IndexedEntry, query: string): number | undefined => {
  const { name, lower } = item
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  if (lower.startsWith(query)) return 3
  if (lower.includes(query)) return 4
  if (isSubsequence(query, lower)) return 5
  return undefined
}

interface Ranked {
  readonly item: IndexedEntry
  readonly score: number
}

const compare = (a: Ranked, b: Ranked) =>
  a.score - b.score ||
  a.item.depth - b.item.depth ||
  (a.item.entry.kind === b.item.entry.kind ? 0 : a.item.entry.kind === "directory" ? -1 : 1) ||
  a.item.entry.path.length - b.item.entry.path.length ||
  (a.item.entry.path < b.item.entry.path ? -1 : a.item.entry.path > b.item.entry.path ? 1 : 0)

export const searchIndex = (
  index: FileIndex,
  query: string,
  limit: number = FILE_SEARCH_LIMIT,
): Array<FileEntry> => {
  if (limit <= 0) return []
  const needle = query.trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase()
  const folder = needle.endsWith("/")
  const bare = needle.replace(/\/+$/, "")
  const best: Array<Ranked> = []
  for (const item of index.entries) {
    const matched =
      needle === "" ? 0 : folder && `${item.lower}/`.startsWith(needle) ? 3 : score(item, bare)
    if (matched === undefined) continue
    const candidate = { item, score: matched }
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
): Array<FileEntry> => searchIndex(indexFiles(files), query, limit)
