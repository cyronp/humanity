import type { FileEntry } from "@humanity/contracts"
import { cn } from "cn"
import { useEffect } from "react"
import { FileTypeIcon } from "./FileTypeIcon.tsx"
import type { FileMentionMenuState } from "./useFileMention.ts"

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
      data-slot="file-mention-menu"
      onMouseDown={(event) => event.preventDefault()}
      className="absolute inset-x-0 bottom-[calc(100%-1rem)] overflow-hidden rounded-t-2xl border border-b-0 border-border/60 bg-card pb-4 text-sm text-card-foreground shadow-md"
    >
      <div
        id={ids.list}
        role="listbox"
        aria-label="Files and folders"
        className="max-h-72 overflow-y-auto p-1.5"
      >
        {status !== undefined && menu.entries.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground" role="status">
            {status}
          </p>
        ) : (
          menu.entries.map((entry, index) => {
            const { name, folder } = splitPath(entry)
            return (
              <div
                key={`${entry.kind}:${entry.path}`}
                id={ids.option(index)}
                role="option"
                aria-selected={index === menu.highlighted}
                onMouseEnter={() => menu.highlight(index)}
                onClick={() => menu.pick(entry)}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 select-none",
                  index === menu.highlighted && "bg-file-ref/10 text-foreground",
                )}
              >
                <FileTypeIcon path={entry.path} directory={entry.kind === "directory"} />
                <span className="max-w-[70%] shrink-0 truncate">{name}</span>
                {folder !== "" && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground" dir="rtl">
                    <bdi>{folder}</bdi>
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
