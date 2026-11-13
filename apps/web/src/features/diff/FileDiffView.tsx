import type { FileDiff } from "@humanity/contracts"
import { countChanges, hunkHeader } from "@humanity/diff"
import { FileDiff as FileDiffIcon, FileMinus, FilePlus, FileSymlink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HunkButtons, HunkLines } from "./HunkView.tsx"

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

/**
 * A read-only view of one file's changes, in one box: a bar naming the file,
 * then its hunks, each after the first opened by its `@@` range. The bar and
 * each range carry their hunk's VS Code and Reference buttons.
 */
export function FileDiffView({
  file,
  onReference,
  editorRoot,
}: {
  readonly file: FileDiff
  /** Puts a `path:line` reference in the next message; its buttons show only when given. */
  readonly onReference?: ((reference: string) => void) | undefined
  /** The absolute folder the file is in; when given, its hunks and lines open in VS Code. */
  readonly editorRoot?: string | undefined
}) {
  const { label, Icon } = KIND[file.kind]
  const counts = countChanges(file.hunks)
  // A deleted file is no longer on disk to open.
  const root = file.kind === "delete" ? undefined : editorRoot
  const [first, ...rest] = file.hunks
  const links = { filePath: file.filePath, onReference, editorRoot: root }

  return (
    <section
      className="overflow-hidden rounded-md border bg-card"
      aria-label={`Changes to ${file.filePath}`}
    >
      <header className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <code className="font-mono text-xs font-medium break-all">{file.filePath}</code>
          {file.previousPath !== undefined && (
            <span className="text-xs text-muted-foreground">
              from <code>{file.previousPath}</code>
            </span>
          )}
          <Badge variant="outline">{label}</Badge>
          <ChangeCount {...counts} />
        </div>
        {first !== undefined && !file.binary && (
          <div className="flex shrink-0 items-center gap-1">
            <HunkButtons hunk={first} {...links} />
          </div>
        )}
      </header>
      {file.binary ? (
        <p className="p-3 text-xs text-muted-foreground">
          Binary or very large file. Its content is not shown.
        </p>
      ) : first === undefined ? (
        <p className="p-3 text-xs text-muted-foreground">
          No line changes (mode change or empty file).
        </p>
      ) : (
        <>
          <HunkLines hunk={first} {...links} />
          {rest.map((hunk) => (
            <div key={hunk.index}>
              <div className="flex items-center justify-between gap-2 border-y bg-muted/30 px-3 py-0.5">
                <code className="font-mono text-xs text-muted-foreground">{hunkHeader(hunk)}</code>
                <div className="flex items-center gap-1">
                  <HunkButtons hunk={hunk} {...links} />
                </div>
              </div>
              <HunkLines hunk={hunk} {...links} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}
