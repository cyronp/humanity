import type { FileDiff } from "@humanity/contracts"
import { countChanges, hunkHeader } from "@humanity/diff"
import {
  ChevronRight,
  FileDiff as FileDiffIcon,
  FileMinus,
  FilePlus,
  FileSymlink,
} from "lucide-react"
import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FILE_STATUS, fileNameClass, FileStatusLetter } from "./FileStatus.tsx"
import { HunkButtons, HunkLines } from "./HunkView.tsx"

const ICON = {
  create: FilePlus,
  modify: FileDiffIcon,
  delete: FileMinus,
  rename: FileSymlink,
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
 *
 * Only the bar shows until it is clicked: a file's lines are highlighted when
 * it is first opened, so a long list of changes stays quick. `open` and
 * `onOpenChange` let the caller remember which files are open.
 */
export function FileDiffView({
  file,
  onReference,
  editorRoot,
  open: openProp,
  onOpenChange,
}: {
  readonly file: FileDiff
  /** Puts a `path:line` reference in the next message; its buttons show only when given. */
  readonly onReference?: ((reference: string) => void) | undefined
  /** The absolute folder the file is in; when given, its hunks and lines open in VS Code. */
  readonly editorRoot?: string | undefined
  readonly open?: boolean | undefined
  readonly onOpenChange?: ((open: boolean) => void) | undefined
}) {
  const [openHere, setOpenHere] = useState(false)
  const open = openProp ?? openHere
  const setOpen = (next: boolean) => {
    setOpenHere(next)
    onOpenChange?.(next)
  }
  const Icon = ICON[file.kind]
  const counts = countChanges(file.hunks)
  // A deleted file is no longer on disk to open.
  const root = file.kind === "delete" ? undefined : editorRoot
  const [first] = file.hunks
  const links = { filePath: file.filePath, onReference, editorRoot: root }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        className="group/file overflow-hidden rounded-md border bg-card"
        aria-label={`Changes to ${file.filePath}`}
      >
        <header className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 group-data-[state=open]/file:border-b">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="-my-1.5 -ml-3 flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1.5 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${open ? "Hide" : "Show"} the changes to ${file.filePath}`}
            >
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/file:rotate-90" />
              <Icon className={`size-4 shrink-0 ${FILE_STATUS[file.kind].color}`} />
              <code
                className={`font-mono text-xs font-medium break-all ${fileNameClass(file.kind)}`}
              >
                {file.filePath}
              </code>
              {file.previousPath !== undefined && (
                <span className="text-xs text-muted-foreground">
                  from <code>{file.previousPath}</code>
                </span>
              )}
              <ChangeCount {...counts} />
              <FileStatusLetter kind={file.kind} className="ml-auto" />
            </button>
          </CollapsibleTrigger>
          {first !== undefined && !file.binary && (
            <div className="flex shrink-0 items-center gap-1">
              <HunkButtons hunk={first} {...links} />
            </div>
          )}
        </header>
        <CollapsibleContent>
          <FileDiffBody file={file} links={links} />
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** The hunks of an open file: mounted only while it is open. */
function FileDiffBody({
  file,
  links,
}: {
  readonly file: FileDiff
  readonly links: {
    readonly filePath: string
    readonly onReference?: ((reference: string) => void) | undefined
    readonly editorRoot?: string | undefined
  }
}) {
  const [first, ...rest] = file.hunks
  return (
    <>
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
    </>
  )
}
