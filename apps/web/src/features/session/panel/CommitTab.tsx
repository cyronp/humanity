import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FileDiff, Session } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { cn } from "cn"
import { Exit } from "effect"
import { GitCommitHorizontal } from "lucide-react"
import { type FormEvent, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { fileNameClass, FileStatusLetter } from "@/features/diff/FileStatus"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { commitAtom, sessionDiffAtom } from "../atoms.ts"
import { isBusy } from "../state.ts"
import { commitPaths } from "./publication.ts"
import { PublishSection } from "./PublishSection.tsx"

/**
 * Commits the changes where the session works, the files the human picks;
 * once nothing is left to commit, pushes the branch and opens its pull request.
 */
export function CommitTab({
  session,
  onOpenPullRequest,
}: {
  readonly session: Session
  /** Shows the pull request tab. */
  readonly onOpenPullRequest: () => void
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  return (
    <AsyncView result={diff} errorTitle="Could not read the worktree">
      {(value) =>
        value.files.length === 0 ? (
          <PublishSection session={session} onOpenPullRequest={onOpenPullRequest} />
        ) : (
          <CommitForm session={session} files={value.files} />
        )
      }
    </AsyncView>
  )
}

function CommitForm({
  session,
  files,
}: {
  readonly session: Session
  readonly files: ReadonlyArray<FileDiff>
}) {
  const commit = useAtomSet(commitAtom, { mode: "promiseExit" })
  // What the human unticked; a file that shows up later starts ticked.
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const busy = isBusy(session.status)

  const picked = files.filter((file) => !left.has(file.filePath))
  const everything = picked.length === files.length
  const counts = countChanges(picked.flatMap((file) => file.hunks))

  const toggle = (path: string) =>
    setLeft((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (message.trim() === "" || picked.length === 0 || pending) return
    setPending(true)
    setError(undefined)
    const exit = await commit({
      payload: {
        sessionId: session.id,
        message: message.trim(),
        // Everything goes through `git add --all`, which also catches what appeared meanwhile.
        ...(everything ? {} : { paths: commitPaths(picked) }),
      },
      reactivityKeys: [
        keys.sessionDiff(session.id),
        keys.git(session.projectId),
        keys.publication(session.id),
      ],
    })
    setPending(false)
    if (Exit.isSuccess(exit)) {
      setMessage("")
      setLeft(new Set())
    } else {
      setError(describeCause(exit.cause))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border bg-card">
        <label className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs font-medium">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={everything}
            ref={(box) => {
              if (box !== null) box.indeterminate = !everything && picked.length > 0
            }}
            onChange={() =>
              setLeft(everything ? new Set(files.map((file) => file.filePath)) : new Set())
            }
          />
          {picked.length} of {files.length} file{files.length === 1 ? "" : "s"}
          <span className="ml-auto">
            <ChangeCount {...counts} />
          </span>
        </label>
        <ul className="max-h-72 divide-y overflow-y-auto scrollbar-thin">
          {files.map((file) => (
            <li key={`${file.kind}:${file.filePath}`}>
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="size-3.5 shrink-0 accent-primary"
                  checked={!left.has(file.filePath)}
                  onChange={() => toggle(file.filePath)}
                />
                <code
                  className={cn("min-w-0 flex-1 truncate font-mono", fileNameClass(file.kind))}
                  title={file.filePath}
                >
                  {file.filePath}
                </code>
                <span className="shrink-0">
                  <ChangeCount {...countChanges(file.hunks)} />
                </span>
                <FileStatusLetter kind={file.kind} />
              </label>
            </li>
          ))}
        </ul>
      </div>
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Commit message"
        rows={3}
        aria-label="Commit message"
      />
      <div className="flex items-center justify-end gap-2">
        {busy && (
          <span className="mr-auto text-xs text-muted-foreground">
            Wait for the agent to finish before committing.
          </span>
        )}
        <Button
          type="submit"
          disabled={busy || pending || message.trim() === "" || picked.length === 0}
        >
          <GitCommitHorizontal />
          {pending
            ? "Committing…"
            : `Commit ${picked.length} file${picked.length === 1 ? "" : "s"} to ${session.branch}`}
        </Button>
      </div>
      {error !== undefined && <ErrorNote title="The commit failed" message={error} />}
    </form>
  )
}
