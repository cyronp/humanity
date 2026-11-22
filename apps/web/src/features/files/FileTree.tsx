import {
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "cn"
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { FILE_STATUS, fileNameClass } from "@/features/diff/FileStatus"
import { buildFileTree, type FileNode, nameOf, ROOT_ID, type TreeChanges } from "./tree.ts"

const ROW_HEIGHT = 24
const INDENT = 12

export function FileTree({
  files,
  changes,
  active,
  expanded,
  onExpandedChange,
  onOpen,
}: {
  readonly files: ReadonlyArray<string>
  readonly changes: TreeChanges
  readonly active: string | null
  readonly expanded: ReadonlyArray<string>
  readonly onExpandedChange: (expanded: ReadonlyArray<string>) => void
  readonly onOpen: (path: string) => void
}) {
  const nodes = useMemo(() => buildFileTree(files), [files])
  const selected = useMemo(() => (active === null ? [] : [active]), [active])
  const scroller = useRef<HTMLDivElement | null>(null)
  const scrollTo = useRef<(index: number) => void>(() => {})

  const tree = useTree<FileNode>({
    rootItemId: ROOT_ID,
    indent: INDENT,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().folder,
    dataLoader: {
      getItem: (id) => nodes.get(id) ?? { id, name: nameOf(id), folder: false, children: [] },
      getChildren: (id) => [...(nodes.get(id)?.children ?? [])],
    },
    state: { expandedItems: expanded as Array<string>, selectedItems: selected as Array<string> },
    setExpandedItems: (updater) =>
      onExpandedChange(typeof updater === "function" ? updater([...expanded]) : updater),
    setSelectedItems: () => {},
    onPrimaryAction: (item) => {
      if (!item.isFolder()) onOpen(item.getId())
    },
    scrollToItem: (item) => scrollTo.current(item.getItemMeta().index),
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  })

  useEffect(() => tree.rebuildTree(), [nodes, tree])

  const items = tree.getItems()
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  scrollTo.current = (index) => virtualizer.scrollToIndex(index, { align: "auto" })

  useEffect(() => {
    if (active === null) return
    const index = tree.getItems().findIndex((item) => item.getId() === active)
    if (index !== -1) virtualizer.scrollToIndex(index, { align: "auto" })
  }, [active, expanded, tree, virtualizer])

  const container = tree.getContainerProps("Files") as Record<string, unknown> & {
    readonly ref: (element: HTMLElement | null) => void
  }

  if (files.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No files yet.</p>
  }

  return (
    <div
      {...container}
      ref={(element) => {
        scroller.current = element
        container.ref(element)
      }}
      className="min-h-0 flex-1 overflow-auto py-1 outline-none scrollbar-thin"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]
          if (item === undefined) return null
          return (
            <TreeRow
              key={item.getKey()}
              item={item}
              top={row.start}
              active={item.getId() === active}
              changes={changes}
            />
          )
        })}
      </div>
    </div>
  )
}

function TreeRow({
  item,
  top,
  active,
  changes,
}: {
  readonly item: ItemInstance<FileNode>
  readonly top: number
  readonly active: boolean
  readonly changes: TreeChanges
}) {
  const node = item.getItemData()
  const level = item.getItemMeta().level
  const kind = node.folder ? undefined : changes.files.get(node.id)
  const changedInside = node.folder && changes.folders.has(node.id)
  const expanded = node.folder && item.isExpanded()
  const Icon = node.folder ? (expanded ? FolderOpen : Folder) : File
  const props = item.getProps() as Record<string, unknown>
  return (
    <div
      {...props}
      title={node.id}
      className={cn(
        "absolute inset-x-0 flex cursor-pointer items-center gap-1 pr-2 text-[0.8125rem] outline-none select-none",
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
      )}
      style={{ top, height: ROW_HEIGHT, paddingLeft: 8 + level * INDENT }}
    >
      <ChevronRight
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          !node.folder && "invisible",
          expanded && "rotate-90",
        )}
      />
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          kind !== undefined && fileNameClass(kind),
          changedInside && "text-git-modified",
        )}
      >
        {node.name}
      </span>
      {kind !== undefined && (
        <span
          className={cn(
            "shrink-0 font-mono text-[0.6875rem] font-semibold",
            FILE_STATUS[kind].color,
          )}
          aria-label={FILE_STATUS[kind].label}
        >
          {FILE_STATUS[kind].letter}
        </span>
      )}
      {changedInside && (
        <span aria-label="Has changes" className="size-1.5 shrink-0 rounded-full bg-git-modified" />
      )}
    </div>
  )
}
