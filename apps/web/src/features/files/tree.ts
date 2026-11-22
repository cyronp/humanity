import type { FileDiff } from "@humanity/contracts"

export const ROOT_ID = ""

export interface FileNode {
  readonly id: string
  readonly name: string
  readonly folder: boolean
  readonly children: ReadonlyArray<string>
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

const parentOf = (path: string) => {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? ROOT_ID : path.slice(0, slash)
}

export const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1)

export const buildFileTree = (files: ReadonlyArray<string>): ReadonlyMap<string, FileNode> => {
  const children = new Map<string, Set<string>>([[ROOT_ID, new Set()]])
  const folders = new Set<string>([ROOT_ID])
  const link = (child: string) => {
    let current = child
    while (current !== ROOT_ID) {
      const parent = parentOf(current)
      const known = children.get(parent)
      if (known === undefined) children.set(parent, new Set([current]))
      else if (known.has(current)) return
      else known.add(current)
      folders.add(parent)
      current = parent
    }
  }
  for (const file of files) link(file)
  const sorted = (ids: Iterable<string>) =>
    [...ids].sort((a, b) => {
      const folderFirst = Number(folders.has(b)) - Number(folders.has(a))
      return folderFirst !== 0 ? folderFirst : collator.compare(nameOf(a), nameOf(b))
    })
  const nodes = new Map<string, FileNode>()
  for (const id of folders) {
    nodes.set(id, { id, name: nameOf(id), folder: true, children: sorted(children.get(id) ?? []) })
  }
  for (const file of files) {
    if (!folders.has(file)) {
      nodes.set(file, { id: file, name: nameOf(file), folder: false, children: [] })
    }
  }
  return nodes
}

export const ancestorsOf = (path: string): Array<string> => {
  const found: Array<string> = []
  let current = parentOf(path)
  while (current !== ROOT_ID) {
    found.unshift(current)
    current = parentOf(current)
  }
  return found
}

export type ChangeKind = FileDiff["kind"]

export interface TreeChanges {
  readonly files: ReadonlyMap<string, ChangeKind>
  readonly folders: ReadonlySet<string>
}

export const treeChanges = (diff: ReadonlyArray<FileDiff>): TreeChanges => {
  const files = new Map<string, ChangeKind>()
  const folders = new Set<string>()
  for (const file of diff) {
    files.set(file.filePath, file.kind)
    for (const folder of ancestorsOf(file.filePath)) folders.add(folder)
  }
  return { files, folders }
}
