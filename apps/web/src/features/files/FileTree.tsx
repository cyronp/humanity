import {
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "cn"
import {
  ChevronRight,
  Ellipsis,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type EntryAction, parentOf } from "./entries.ts"
import { FileIcon } from "./FileIcon.tsx"
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
  icons,
  onAction,
}: {
  readonly onAction?: ((action: EntryAction) => void) | undefined
  readonly icons: boolean
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
              icons={icons}
              onAction={onAction}
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
  icons,
  onAction,
}: {
  readonly onAction: ((action: EntryAction) => void) | undefined
  readonly icons: boolean
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
        "group/row absolute inset-x-0 flex cursor-pointer items-center gap-1 pr-2 text-[0.8125rem] outline-none select-none",
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
      {icons ? (
        <FileIcon path={node.id} folder={node.folder} expanded={expanded} />
      ) : (
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      )}
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
      {onAction !== undefined && <RowMenu node={node} onAction={onAction} />}
    </div>
  )
}

function RowMenu({
  node,
  onAction,
}: {
  readonly node: FileNode
  readonly onAction: (action: EntryAction) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${node.name}`}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Ellipsis className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem
          onSelect={() =>
            onAction({ kind: "new", folder: node.folder ? node.id : parentOf(node.id) })
          }
        >
          <FilePlus />
          New file{node.folder ? " here" : " beside it"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onAction({ kind: "rename", path: node.id, folder: node.folder })}
        >
          <Pencil />
          Rename or move
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onAction({ kind: "delete", path: node.id, folder: node.folder })}
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
