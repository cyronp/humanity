import type { FileEntry } from "@humanity/contracts"

/** How many entries one search returns at most. */
export const FILE_SEARCH_LIMIT = 30

/** `git ls-files -z` output as paths, without duplicates (a conflicted file is listed once per stage). */
export const parseFileList = (output: string): Array<string> => [
  ...new Set(output.split("\0").filter((path) => path !== "")),
]

/** The files, and every folder that holds one, each once. */
const entriesOf = (files: ReadonlyArray<string>): Array<FileEntry> => {
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
  return [
    ...[...directories].map((path): FileEntry => ({ path, kind: "directory" })),
    ...files.map((path): FileEntry => ({ path, kind: "file" })),
  ]
}

/** Whether every character of `needle` appears in `haystack`, in order. */
const isSubsequence = (needle: string, haystack: string) => {
  let at = 0
  for (const char of haystack) {
    if (char === needle[at]) at++
    if (at === needle.length) return true
  }
  return needle.length === 0
}

/**
 * How well `path` matches `query` (both lower case): lower is better,
 * `undefined` is no match. The name counts before the folders around it,
 * and a scattered match counts least.
 */
const score = (path: string, query: string): number | undefined => {
  const name = path.slice(path.lastIndexOf("/") + 1)
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  if (path.startsWith(query)) return 3
  if (path.includes(query)) return 4
  if (isSubsequence(query, path)) return 5
  return undefined
}

const depth = (path: string) => path.split("/").length

/**
 * The entries of `files` (paths relative to the working copy) that match
 * `query`, best first, at most `limit`. An empty query lists the top of the
 * tree: shallow entries first, folders before files. A query may name a
 * folder with a trailing `/`, or use `\` as Windows paths do.
 */
export const searchFiles = (
  files: ReadonlyArray<string>,
  query: string,
  limit: number = FILE_SEARCH_LIMIT,
): Array<FileEntry> => {
  const needle = query.trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase()
  const ranked: Array<{ readonly entry: FileEntry; readonly score: number }> = []
  for (const entry of entriesOf(files)) {
    const lower = entry.path.toLowerCase()
    const matched =
      needle === ""
        ? 0
        : // `src/` names the folder `src`, and what is inside it.
          needle.endsWith("/") && `${lower}/`.startsWith(needle)
          ? 3
          : score(lower, needle.replace(/\/+$/, ""))
    if (matched !== undefined) ranked.push({ entry, score: matched })
  }
  ranked.sort(
    (a, b) =>
      a.score - b.score ||
      depth(a.entry.path) - depth(b.entry.path) ||
      (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === "directory" ? -1 : 1) ||
      a.entry.path.length - b.entry.path.length ||
      (a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0),
  )
  return ranked.slice(0, limit).map(({ entry }) => entry)
}
