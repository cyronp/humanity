import { useAtomSet } from "@effect/atom-react"
import { type SessionId, plural } from "@humanity/contracts"
import { Exit } from "effect"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { createEntryAtom, deleteEntriesAtom, renameEntryAtom } from "./atoms.ts"
import { type EntryAction, entryPathProblem, filesUnder, normalizeEntryPath } from "./entries.ts"

export function EntryDialog({
  sessionId,
  action,
  files,
  tracked,
  dirty,
  onClose,
  onDone,
}: {
  readonly sessionId: SessionId
  readonly action: EntryAction | undefined
  readonly files: ReadonlyArray<string>
  readonly tracked: (path: string) => boolean
  readonly dirty: (path: string) => boolean
  readonly onClose: () => void
  readonly onDone: (result: EntryResult) => void
}) {
  return (
    <Dialog open={action !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {action !== undefined && (
          <EntryForm
            key={action.kind === "new" ? `new:${action.folder}` : `${action.kind}:${action.path}`}
            sessionId={sessionId}
            action={action}
            files={files}
            tracked={tracked}
            dirty={dirty}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export type EntryResult =
  | { readonly kind: "new"; readonly path: string }
  | { readonly kind: "rename"; readonly from: string; readonly to: string }
  | { readonly kind: "delete"; readonly path: string }

function EntryForm({
  sessionId,
  action,
  files,
  tracked,
  dirty,
  onClose,
  onDone,
}: {
  readonly sessionId: SessionId
  readonly action: EntryAction
  readonly files: ReadonlyArray<string>
  readonly tracked: (path: string) => boolean
  readonly dirty: (path: string) => boolean
  readonly onClose: () => void
  readonly onDone: (result: EntryResult) => void
}) {
  const create = useAtomSet(createEntryAtom, { mode: "promiseExit" })
  const rename = useAtomSet(renameEntryAtom, { mode: "promiseExit" })
  const remove = useAtomSet(deleteEntriesAtom, { mode: "promiseExit" })
  const [value, setValue] = useState(() =>
    action.kind === "new"
      ? action.folder === ""
        ? ""
        : `${action.folder}/`
      : action.kind === "rename"
        ? action.path
        : "",
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const reactivityKeys = [keys.files(sessionId), keys.sessionDiff(sessionId)]
  const edited = action.kind !== "new" && dirty(action.path)
  const problem = action.kind === "delete" ? undefined : entryPathProblem(value)

  const submit = async () => {
    if (problem !== undefined || edited) return
    setPending(true)
    setError(undefined)
    const path = normalizeEntryPath(value)
    const exit =
      action.kind === "new"
        ? await create({ payload: { sessionId, path, kind: "file" }, reactivityKeys })
        : action.kind === "rename"
          ? await rename({ payload: { sessionId, from: action.path, to: path }, reactivityKeys })
          : await remove({ payload: { sessionId, paths: [action.path] }, reactivityKeys })
    setPending(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    onDone(
      action.kind === "new"
        ? { kind: "new", path }
        : action.kind === "rename"
          ? { kind: "rename", from: action.path, to: path }
          : { kind: "delete", path: action.path },
    )
    onClose()
  }

  const title =
    action.kind === "new"
      ? "New file"
      : action.kind === "rename"
        ? `Rename or move ${action.folder ? "folder" : "file"}`
        : `Delete ${action.path}?`

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
        <DialogDescription>
          {action.kind === "new"
            ? "A path in the thread’s folder. Folders in it are made as needed."
            : action.kind === "rename"
              ? "Change the name, or the path to move it."
              : deleteNote(action, files, tracked)}
        </DialogDescription>
      </DialogHeader>
      {action.kind !== "delete" && (
        <Input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={action.kind === "new" ? "Path of the new file" : "New path"}
          className="font-mono text-sm"
          spellCheck={false}
        />
      )}
      {edited && (
        <p className="text-sm text-warning">
          It has unsaved edits in the editor. Save or close them first.
        </p>
      )}
      {problem !== undefined && value.trim() !== "" && (
        <p className="text-sm text-muted-foreground">{problem}</p>
      )}
      {error !== undefined && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={action.kind === "delete" ? "destructive" : "default"}
          disabled={pending || edited || problem !== undefined}
        >
          {pending && <Spinner />}
          {action.kind === "new" ? "Create" : action.kind === "rename" ? "Rename" : "Delete"}
        </Button>
      </DialogFooter>
    </form>
  )
}

const deleteNote = (
  action: Extract<EntryAction, { kind: "delete" }>,
  files: ReadonlyArray<string>,
  tracked: (path: string) => boolean,
): string => {
  const count = action.folder ? filesUnder(files, action.path) : 1
  const what = action.folder
    ? `The folder and the ${plural(count, "file")} in it are deleted for good.`
    : "The file is deleted for good."
  return tracked(action.path)
    ? `${what} What git tracks can be brought back from git.`
    : `${what} It is not in git: only a checkpoint taken while it was there, before one of your messages, can bring it back with Rewind.`
}
