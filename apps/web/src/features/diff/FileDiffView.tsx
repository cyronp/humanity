import type { FileDiff } from "@humanity/contracts"
import { countChanges, hunkHeader } from "@humanity/diff"
import { cn } from "cn"
import {
  ChevronRight,
  FileDiff as FileDiffIcon,
  FileMinus,
  FilePlus,
  FileSymlink,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FILE_STATUS, fileNameClass, FileStatusLetter } from "./FileStatus.tsx"
import { HunkButtons, HunkLines } from "./HunkView.tsx"

const ICON = {
  create: FilePlus,
  modify: FileDiffIcon,
  delete: FileMinus,
  rename: FileSymlink,
} as const

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

export function FileDiffView({
  file,
  onReference,
  editorRoot,
  open: openProp,
  onOpenChange,
  headerActions,
  flat = false,
}: {
  readonly file: FileDiff
  readonly flat?: boolean
  readonly headerActions?: ReactNode
  readonly onReference?: ((reference: string) => void) | undefined
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
  const root = file.kind === "delete" ? undefined : editorRoot
  const [first] = file.hunks
  const links = { filePath: file.filePath, onReference, editorRoot: root }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        className={cn(
          "group/file overflow-hidden",
          flat ? "border-b" : "rounded-md border bg-card",
        )}
        aria-label={`Changes to ${file.filePath}`}
      >
        <header
          className={cn(
            "flex items-center gap-2 group-data-[state=open]/file:border-b",
            flat ? "px-4 py-2 hover:bg-muted/40" : "bg-muted/50 px-3 py-1.5",
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                flat ? "-my-2 -ml-4 py-2 pl-4" : "-my-1.5 -ml-3 py-1.5 pl-3",
              )}
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
          {(headerActions !== undefined || (first !== undefined && !file.binary)) && (
            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              {first !== undefined && !file.binary && <HunkButtons hunk={first} {...links} />}
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
        <p className="p-3 text-xs text-muted-foreground">Binary or too large to show.</p>
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
