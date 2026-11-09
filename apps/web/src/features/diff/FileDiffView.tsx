import type { FileDiff } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { FileDiff as FileDiffIcon, FileMinus, FilePlus, FileSymlink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HunkView } from "./HunkView.tsx"

const KIND = {
  create: { label: "new file", Icon: FilePlus },
  modify: { label: "modified", Icon: FileDiffIcon },
  delete: { label: "deleted", Icon: FileMinus },
  rename: { label: "renamed", Icon: FileSymlink },
} as const

/** `+12 −3`, the size of a change at a glance. */
export function ChangeCount({
  added,
  removed,
}: {
  readonly added: number
  readonly removed: number
}) {
  return (
    <span className="font-mono text-xs whitespace-nowrap">
      <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>{" "}
      <span className="text-red-600 dark:text-red-400">−{removed}</span>
    </span>
  )
}

/** A read-only view of one file's changes. */
export function FileDiffView({ file }: { readonly file: FileDiff }) {
  const { label, Icon } = KIND[file.kind]
  const counts = countChanges(file.hunks)
  return (
    <section className="flex flex-col gap-2" aria-label={`Changes to ${file.filePath}`}>
      <header className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <code className="font-mono text-sm break-all">{file.filePath}</code>
        {file.previousPath !== undefined && (
          <span className="text-xs text-muted-foreground">
            from <code>{file.previousPath}</code>
          </span>
        )}
        <Badge variant="outline">{label}</Badge>
        <ChangeCount {...counts} />
      </header>
      {file.binary ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Binary or very large file. Its content is not shown.
        </p>
      ) : file.hunks.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No line changes (mode change or empty file).
        </p>
      ) : (
        file.hunks.map((hunk) => <HunkView key={hunk.index} hunk={hunk} filePath={file.filePath} />)
      )}
    </section>
  )
}
