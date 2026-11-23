import {
  FILE_SEARCH_LIMITS,
  type FileSearchMatch,
  type FileSearchResult,
  type NewEntryKind,
  workspacePathProblem,
} from "@humanity/contracts"
import { Effect } from "effect"
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { isInsideDir } from "../paths.ts"
import { attempt, insideRoot, realRoot, refuse } from "./workspaceFiles.ts"

const isMissing = (cause: unknown) =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  ((cause as { readonly code: unknown }).code === "ENOENT" ||
    (cause as { readonly code: unknown }).code === "ENOTDIR")

const exists = (path: string) =>
  Effect.tryPromise({ try: () => lstat(path), catch: (cause) => cause }).pipe(
    Effect.as(true),
    Effect.catch((cause) => (isMissing(cause) ? Effect.succeed(false) : Effect.succeed(true))),
  )

const checkedPath = (root: string, path: string) =>
  Effect.gen(function* () {
    const problem = workspacePathProblem(path)
    if (problem !== undefined) return yield* refuse(path, problem)
    const absolute = resolve(root, ...path.split("/"))
    if (!isInsideDir(resolve(root), absolute)) {
      return yield* refuse(path, "The path must stay inside the thread's folder.")
    }
    return absolute
  })

const existingEntry = (root: string, path: string) =>
  Effect.gen(function* () {
    const absolute = yield* checkedPath(root, path)
    const rootReal = yield* realRoot(root)
    const parent = yield* attempt(path, () => realpath(dirname(absolute)))
    if (!insideRoot(rootReal, parent)) {
      return yield* refuse(path, "It leads outside the thread's folder.")
    }
    yield* attempt(path, () => lstat(absolute))
    return absolute
  })

const newEntry = (root: string, path: string) =>
  Effect.gen(function* () {
    const absolute = yield* checkedPath(root, path)
    if (yield* exists(absolute)) {
      return yield* refuse(path, "A file or folder of that name is already there.")
    }
    const rootReal = yield* realRoot(root)
    let parent = dirname(absolute)
    while (!(yield* exists(parent))) parent = dirname(parent)
    const parentReal = yield* attempt(path, () => realpath(parent))
    if (!insideRoot(rootReal, parentReal)) {
      return yield* refuse(path, "It leads outside the thread's folder.")
    }
    return absolute
  })

export const createEntry = (root: string, path: string, kind: NewEntryKind) =>
  Effect.gen(function* () {
    const absolute = yield* newEntry(root, path)
    yield* attempt(path, () => mkdir(dirname(absolute), { recursive: true }))
    yield* attempt(path, () =>
      kind === "folder" ? mkdir(absolute) : writeFile(absolute, "", { flag: "wx" }),
    )
  })

export const renameEntry = (root: string, from: string, to: string) =>
  Effect.gen(function* () {
    const source = yield* existingEntry(root, from)
    const target = yield* newEntry(root, to)
    if (isInsideDir(source, target)) {
      return yield* refuse(to, "A folder can't be moved into itself.")
    }
    yield* attempt(to, () => mkdir(dirname(target), { recursive: true }))
    yield* attempt(from, () => rename(source, target))
  })

export const deleteEntries = (root: string, paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (paths.length === 0) return yield* refuse("", "Nothing was named to delete.")
    const targets = yield* Effect.forEach([...new Set(paths)], (path) =>
      Effect.map(existingEntry(root, path), (absolute) => ({ path, absolute })),
    )
    for (const { path, absolute } of targets) {
      yield* attempt(path, () => rm(absolute, { recursive: true, force: true }))
    }
  })

export const fileSearchArgs = (options: {
  readonly query: string
  readonly caseSensitive: boolean
  readonly wholeWord: boolean
  readonly regex: boolean
  readonly include?: string | undefined
  readonly exclude?: string | undefined
}): ReadonlyArray<string> => {
  const globs = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map((glob) => glob.trim())
      .filter((glob) => glob !== "")
  const include = globs(options.include).map(
    (glob) => `:(glob)${glob.includes("/") ? glob : `**/${glob}`}`,
  )
  const exclude = globs(options.exclude).map(
    (glob) => `:(exclude,glob)${glob.includes("/") ? glob : `**/${glob}`}`,
  )
  return [
    "grep",
    "-n",
    "--column",
    "-I",
    "--untracked",
    "--exclude-standard",
    "--null",
    "--no-color",
    `--max-count=${FILE_SEARCH_LIMITS.perFile}`,
    ...(options.caseSensitive ? [] : ["-i"]),
    ...(options.wholeWord ? ["-w"] : []),
    options.regex ? "-E" : "-F",
    "-e",
    options.query,
    "--",
    ...(include.length === 0 && exclude.length > 0 ? [":(glob)**"] : include),
    ...exclude,
  ]
}

const preview = (text: string, column: number): string => {
  const line = text.replace(/\r$/, "")
  const limit = FILE_SEARCH_LIMITS.preview
  if (line.length <= limit) return line
  const start = Math.max(0, Math.min(column - 1 - limit / 4, line.length - limit))
  return `${start > 0 ? "…" : ""}${line.slice(start, start + limit)}…`
}

export const parseGrep = (output: string): FileSearchResult => {
  const files = new Map<string, Array<FileSearchMatch>>()
  let matches = 0
  let truncated = false
  for (const row of output.split("\n")) {
    if (row === "") continue
    const [path, line, column, ...rest] = row.split("\0")
    if (path === undefined || line === undefined || column === undefined) continue
    if (matches >= FILE_SEARCH_LIMITS.matches) {
      truncated = true
      break
    }
    const found = files.get(path) ?? []
    const at = Number(column)
    found.push({ line: Number(line), column: at, preview: preview(rest.join("\0"), at) })
    files.set(path, found)
    matches += 1
  }
  return {
    files: [...files.entries()].map(([path, found]) => ({ path, matches: found })),
    matches,
    truncated,
  }
}
