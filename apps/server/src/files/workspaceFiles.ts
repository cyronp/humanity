import {
  FILE_OPEN_LIMIT_BYTES,
  FileAccessFailed,
  FileChangedOnDisk,
  FileNotFound,
  FileRefused,
  type FileVersion,
  type OpenedFile,
  type SavedFile,
  workspacePathProblem,
} from "@humanity/contracts"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { lstat, readFile, realpath, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { isInsideDir } from "../paths.ts"

const BOM = "﻿"

export const versionOf = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex").slice(0, 32)

const codeOf = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { readonly code: unknown }).code)
    : undefined

const isMissing = (cause: unknown) => {
  const code = codeOf(cause)
  return code === "ENOENT" || code === "ENOTDIR"
}

const detailOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

const attempt = <A>(path: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      isMissing(cause)
        ? new FileNotFound({ path })
        : new FileAccessFailed({ path, detail: detailOf(cause) }),
  })

export const decodeText = (
  bytes: Uint8Array,
): { readonly content: string; readonly bom: boolean } | undefined => {
  if (bytes.includes(0)) return undefined
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
    return text.startsWith(BOM)
      ? { content: text.slice(BOM.length), bom: true }
      : { content: text, bom: false }
  } catch {
    return undefined
  }
}

export const encodeText = (content: string, bom: boolean): Uint8Array =>
  new TextEncoder().encode(bom ? `${BOM}${content}` : content)

const refuse = (path: string, reason: string) => Effect.fail(new FileRefused({ path, reason }))

const realRoot = (root: string) => attempt(".", () => realpath(root))

const insideRoot = (rootReal: string, real: string) =>
  real === rootReal || isInsideDir(rootReal, real)

export const resolveExisting = (root: string, path: string) =>
  Effect.gen(function* () {
    const problem = workspacePathProblem(path)
    if (problem !== undefined) return yield* refuse(path, problem)
    const absolute = resolve(root, ...path.split("/"))
    if (!isInsideDir(resolve(root), absolute)) {
      return yield* refuse(path, "The path must stay inside the thread's folder.")
    }
    const rootReal = yield* realRoot(root)
    const real = yield* attempt(path, () => realpath(absolute))
    if (!insideRoot(rootReal, real) || real === rootReal) {
      return yield* refuse(path, "It leads outside the thread's folder.")
    }
    const info = yield* attempt(path, () => lstat(real))
    if (!info.isFile()) return yield* refuse(path, "It is not a file.")
    return { absolute, real, size: info.size }
  })

const resolveNew = (root: string, path: string) =>
  Effect.gen(function* () {
    const problem = workspacePathProblem(path)
    if (problem !== undefined) return yield* refuse(path, problem)
    const absolute = resolve(root, ...path.split("/"))
    if (!isInsideDir(resolve(root), absolute)) {
      return yield* refuse(path, "The path must stay inside the thread's folder.")
    }
    const rootReal = yield* realRoot(root)
    const parent = yield* attempt(path, () => realpath(dirname(absolute)))
    if (!insideRoot(rootReal, parent)) {
      return yield* refuse(path, "It leads outside the thread's folder.")
    }
    return { real: join(parent, basename(absolute)) }
  })

export const readWorkspaceFile = (root: string, path: string) =>
  Effect.gen(function* () {
    const file = yield* resolveExisting(root, path)
    if (file.size > FILE_OPEN_LIMIT_BYTES) {
      return { _tag: "TooLarge", path, size: file.size } satisfies OpenedFile
    }
    const bytes = yield* attempt(path, () => readFile(file.real))
    const text = decodeText(bytes)
    if (text === undefined) return { _tag: "Binary", path, size: bytes.length } satisfies OpenedFile
    return { _tag: "Text", path, ...text, version: versionOf(bytes) } satisfies OpenedFile
  })

const currentVersion = (root: string, path: string) =>
  Effect.gen(function* () {
    const file = yield* resolveExisting(root, path)
    const bytes = yield* attempt(path, () => readFile(file.real))
    return versionOf(bytes)
  }).pipe(Effect.catchTag("FileNotFound", () => Effect.succeed(null)))

export const workspaceVersions = (root: string, paths: ReadonlyArray<string>) =>
  Effect.forEach(
    [...new Set(paths)],
    (path) => Effect.map(currentVersion(root, path), (version): FileVersion => ({ path, version })),
    { concurrency: 8 },
  )

export const writeWorkspaceFile = (
  root: string,
  request: {
    readonly path: string
    readonly content: string
    readonly bom: boolean
    readonly baseVersion: string | null
    readonly overwrite: boolean
  },
) =>
  Effect.gen(function* () {
    const { path } = request
    const onDisk = yield* currentVersion(root, path)
    if (!request.overwrite && onDisk !== request.baseVersion) {
      return yield* new FileChangedOnDisk({ path, version: onDisk })
    }
    const target =
      onDisk === null
        ? (yield* resolveNew(root, path)).real
        : (yield* resolveExisting(root, path)).real
    const bytes = encodeText(request.content, request.bom)
    yield* attempt(path, () => writeFile(target, bytes))
    return { path, version: versionOf(bytes) } satisfies SavedFile
  })
