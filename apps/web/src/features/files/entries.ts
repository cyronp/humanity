import { workspacePathProblem } from "@humanity/contracts"

export type EntryAction =
  | { readonly kind: "new"; readonly folder: string }
  | { readonly kind: "rename"; readonly path: string; readonly folder: boolean }
  | { readonly kind: "delete"; readonly path: string; readonly folder: boolean }

export const parentOf = (path: string): string => {
  const cut = path.lastIndexOf("/")
  return cut === -1 ? "" : path.slice(0, cut)
}

export const isUnder = (path: string, entry: string): boolean =>
  path === entry || path.startsWith(`${entry}/`)

export const movedPath = (path: string, from: string, to: string): string =>
  path === from ? to : isUnder(path, from) ? `${to}${path.slice(from.length)}` : path

export const normalizeEntryPath = (input: string): string =>
  input.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "")

export const entryPathProblem = (input: string): string | undefined => {
  const path = normalizeEntryPath(input)
  if (path === "") return "Name the file."
  return workspacePathProblem(path)
}

export const filesUnder = (files: ReadonlyArray<string>, entry: string): number =>
  files.filter((path) => isUnder(path, entry)).length
