import type { FileDiff } from "@humanity/contracts"
import { computeHunks } from "@humanity/diff"
import { EditorView } from "@codemirror/view"
import { cn } from "cn"
import { AlertTriangle, AtSign, Circle, FileQuestion, Loader2, Save, X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileDiffView } from "@/features/diff/FileDiffView"
import { nameOf } from "./tree.ts"
import type { DocSnapshot, FileWorkspace, WorkspaceSnapshot } from "./workspace.ts"
import "./editor.css"

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function EditorPane({
  workspace,
  snapshot,
  readOnly,
  onReference,
}: {
  readonly workspace: FileWorkspace
  readonly snapshot: WorkspaceSnapshot
  readonly readOnly: boolean
  readonly onReference?: ((reference: string) => void) | undefined
}) {
  const host = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState<string>()
  const [comparing, setComparing] = useState<{ path: string; diff: FileDiff }>()
  const active = snapshot.tabs.active
  const doc = active === null ? undefined : snapshot.docs.get(active)
  const textShown = doc?.view.kind === "text"

  useEffect(() => {
    const parent = host.current
    if (parent === null) return
    const view = new EditorView({ parent })
    workspace.attach(view)
    return () => {
      workspace.attach(null)
      view.destroy()
    }
  }, [workspace])

  useEffect(() => {
    workspace.show(textShown ? active : null)
  }, [workspace, active, textShown])

  const requestClose = (path: string) => {
    if (workspace.isDirty(path)) setClosing(path)
    else workspace.close(path)
  }

  const compare = async (path: string) => {
    const disk = await workspace.readDisk(path)
    const mine = workspace.contentOf(path)
    if (disk === null || mine === undefined) return
    const hunks = computeHunks(disk, mine).map(({ id: _, status: __, ...hunk }) => hunk)
    setComparing({ path, diff: { filePath: path, kind: "modify", binary: false, hunks } })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {snapshot.tabs.open.length > 0 && (
        <div
          role="tablist"
          aria-label="Open files"
          className="flex h-9 shrink-0 overflow-x-auto border-b scrollbar-none"
        >
          {snapshot.tabs.open.map((path) => (
            <EditorTab
              key={path}
              path={path}
              doc={snapshot.docs.get(path)}
              active={path === active}
              onSelect={() => workspace.activate(path)}
              onClose={() => requestClose(path)}
            />
          ))}
        </div>
      )}
      {doc !== undefined && (
        <DocBar
          doc={doc}
          readOnly={readOnly}
          onSave={() => void workspace.save(doc.path)}
          onReference={onReference === undefined ? undefined : () => onReference(doc.path)}
        />
      )}
      {doc?.conflict !== undefined && (
        <ConflictBar
          doc={doc}
          onCompare={() => void compare(doc.path)}
          onKeepMine={() => void workspace.keepMine(doc.path)}
          onTakeDisk={() => void workspace.takeDisk(doc.path)}
          onClose={() => workspace.close(doc.path)}
        />
      )}
      {doc?.saveError !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          {doc.saveError}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={host}
          className={cn("files-editor absolute inset-0", !textShown && "invisible")}
        />
        {!textShown && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Placeholder doc={doc} />
          </div>
        )}
      </div>
      <AlertDialog
        open={closing !== undefined}
        onOpenChange={(open) => !open && setClosing(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Save the changes to ${closing === undefined ? "" : nameOf(closing)}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes are lost if you don't save them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (closing !== undefined) workspace.close(closing)
                setClosing(undefined)
              }}
            >
              Don't save
            </Button>
            <AlertDialogAction
              disabled={readOnly}
              onClick={() => {
                const path = closing
                setClosing(undefined)
                if (path === undefined) return
                void workspace.save(path).then(() => {
                  if (!workspace.isDirty(path)) workspace.close(path)
                })
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={comparing !== undefined}
        onOpenChange={(open) => !open && setComparing(undefined)}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {comparing === undefined ? "" : `${comparing.path}: on disk ↔ yours`}
            </DialogTitle>
            <DialogDescription>
              Removed lines are on disk now; added lines are your unsaved version.
            </DialogDescription>
          </DialogHeader>
          {comparing !== undefined && (
            <ScrollArea className="min-h-0 flex-1 rounded-md border">
              {comparing.diff.hunks.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Both versions are the same.</p>
              ) : (
                <FileDiffView file={comparing.diff} flat open />
              )}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EditorTab({
  path,
  doc,
  active,
  onSelect,
  onClose,
}: {
  readonly path: string
  readonly doc: DocSnapshot | undefined
  readonly active: boolean
  readonly onSelect: () => void
  readonly onClose: () => void
}) {
  const dirty = doc?.view.kind === "text" && doc.view.dirty
  return (
    <div
      className={cn(
        "group/tab flex shrink-0 items-center gap-1 border-r pr-1 pl-3 text-[0.8125rem]",
        active
          ? "bg-background text-foreground"
          : "bg-muted/40 text-muted-foreground hover:text-foreground",
      )}
      onAuxClick={(event) => {
        if (event.button === 1) onClose()
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={path}
        onClick={onSelect}
        className={cn(
          "max-w-48 truncate py-2 outline-none focus-visible:underline",
          doc?.conflict !== undefined && "text-warning-foreground",
        )}
      >
        {nameOf(path)}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={dirty ? `Close ${path} (unsaved)` : `Close ${path}`}
        title={dirty ? "Unsaved changes" : "Close"}
        className="group/close flex size-5 items-center justify-center rounded-sm hover:bg-accent"
      >
        {dirty ? (
          <>
            <Circle className="size-2 fill-current group-hover/close:hidden" />
            <X className="hidden size-3.5 group-hover/close:block" />
          </>
        ) : (
          <X className={cn("size-3.5", !active && "opacity-0 group-hover/tab:opacity-100")} />
        )}
      </button>
    </div>
  )
}

function DocBar({
  doc,
  readOnly,
  onSave,
  onReference,
}: {
  readonly doc: DocSnapshot
  readonly readOnly: boolean
  readonly onSave: () => void
  readonly onReference: (() => void) | undefined
}) {
  const text = doc.view.kind === "text" ? doc.view : undefined
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
      <code
        className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
        title={doc.path}
      >
        {doc.path}
      </code>
      {readOnly && <span className="text-xs text-muted-foreground">Read-only</span>}
      {onReference !== undefined && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onReference}
          title="Reference this file in your next message"
        >
          <AtSign />
          Reference
        </Button>
      )}
      {text !== undefined && !readOnly && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onSave}
          disabled={!text.dirty || text.saving}
          title="Save (Ctrl+S)"
        >
          {text.saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
      )}
    </div>
  )
}

function ConflictBar({
  doc,
  onCompare,
  onKeepMine,
  onTakeDisk,
  onClose,
}: {
  readonly doc: DocSnapshot
  readonly onCompare: () => void
  readonly onKeepMine: () => void
  readonly onTakeDisk: () => void
  readonly onClose: () => void
}) {
  const deleted = doc.conflict?.version === null
  const dirty = doc.view.kind === "text" && doc.view.dirty
  return (
    <div
      role="alert"
      className="flex shrink-0 flex-col gap-2 border-b bg-warning/15 px-3 py-2 text-xs"
    >
      <p className="flex items-start gap-2">
        <AlertTriangle className="size-4 shrink-0 text-warning-foreground" />
        <span className="min-w-0 flex-1">
          {deleted
            ? "Deleted on disk, by the agent or another program."
            : dirty
              ? "Changed on disk, by the agent or another program, while you had unsaved changes."
              : "Changed on disk, by the agent or another program, since you last saved."}
        </span>
      </p>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {!deleted && dirty && (
          <Button variant="ghost" size="xs" onClick={onCompare}>
            Compare
          </Button>
        )}
        {deleted ? (
          <Button variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>
        ) : (
          <Button variant="outline" size="xs" onClick={onTakeDisk}>
            Use the file on disk
          </Button>
        )}
        <Button size="xs" onClick={onKeepMine}>
          {deleted ? "Save mine again" : "Keep mine"}
        </Button>
      </div>
    </div>
  )
}

function Placeholder({ doc }: { readonly doc: DocSnapshot | undefined }) {
  const message: ReactNode =
    doc === undefined ? (
      <>
        <FileQuestion className="size-8 text-muted-foreground/60" />
        <span>Pick a file in the tree, or press Ctrl+P to find one.</span>
      </>
    ) : doc.view.kind === "loading" ? (
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    ) : doc.view.kind === "binary" ? (
      `${nameOf(doc.path)} is a binary file (${sizeLabel(doc.view.size)}), which the editor does not show.`
    ) : doc.view.kind === "tooLarge" ? (
      `${nameOf(doc.path)} is ${sizeLabel(doc.view.size)}, too large to open here.`
    ) : doc.view.kind === "missing" ? (
      `${doc.path} no longer exists.`
    ) : doc.view.kind === "error" ? (
      doc.view.message
    ) : null
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
