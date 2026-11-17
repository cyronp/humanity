import type { FileEntry } from "@humanity/contracts"
import { cn } from "cn"
import { File, Folder } from "lucide-react"
import { useEffect } from "react"
import type { FileMentionMenuState } from "./useFileMention.ts"

/** The id of the list and of each of its options, for the message box's `aria-*`. */
export const fileMentionIds = (base: string) => ({
  list: `${base}-files`,
  option: (index: number) => `${base}-file-${index}`,
})

const splitPath = (entry: FileEntry) => {
  const slash = entry.path.lastIndexOf("/")
  return {
    name: entry.path.slice(slash + 1) + (entry.kind === "directory" ? "/" : ""),
    folder: slash === -1 ? "" : entry.path.slice(0, slash),
  }
}

/**
 * The files and folders offered under an `@`, drawn just above the message
 * box. The caret stays in the box: the list never takes the focus, and the
 * box's keys move through it.
 */
export function FileMentionMenu({
  menu,
  idBase,
}: {
  readonly menu: FileMentionMenuState
  readonly idBase: string
}) {
  const ids = fileMentionIds(idBase)

  useEffect(() => {
    document
      .getElementById(fileMentionIds(idBase).option(menu.highlighted))
      ?.scrollIntoView({ block: "nearest" })
  }, [idBase, menu.highlighted])

  const status =
    menu.error ??
    (menu.entries.length > 0
      ? undefined
      : menu.searching
        ? "Searching files…"
        : "No matching files")

  return (
    <div
      id={ids.list}
      role="listbox"
      aria-label="Files and folders"
      // Clicking an option must not take the focus, and the caret, out of the box.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-y-auto rounded-xl bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {status !== undefined && menu.entries.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground" role="status">
          {status}
        </p>
      ) : (
        menu.entries.map((entry, index) => {
          const { name, folder } = splitPath(entry)
          const Icon = entry.kind === "directory" ? Folder : File
          return (
            <div
              key={`${entry.kind}:${entry.path}`}
              id={ids.option(index)}
              role="option"
              aria-selected={index === menu.highlighted}
              onMouseEnter={() => menu.highlight(index)}
              onClick={() => menu.pick(entry)}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 select-none",
                index === menu.highlighted && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="max-w-[70%] shrink-0 truncate">{name}</span>
              {folder !== "" && (
                <span className="min-w-0 truncate text-xs text-muted-foreground" dir="rtl">
                  {/* rtl cuts a long folder from its start; bdi keeps it reading left to right. */}
                  <bdi>{folder}</bdi>
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
