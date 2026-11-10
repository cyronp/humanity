import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { Exit } from "effect"
import { GitCommitHorizontal, RefreshCw } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChangeCount, FileDiffView } from "@/features/diff/FileDiffView"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { commitAtom, sessionDiffAtom } from "./atoms.ts"
import { isBusy } from "./state.ts"

/**
 * What the session's worktree holds that its branch doesn't yet: every hunk
 * here was approved by the human (or written by them). Commits go to the
 * session branch only.
 */
export function ChangesPanel({
  session,
  activity,
}: {
  readonly session: Session
  /** Changes whenever the agent may have written files, to refresh the diff. */
  readonly activity: number
}) {
  const diff = useAtomValue(sessionDiffAtom(session.id))
  const refresh = useAtomRefresh(sessionDiffAtom(session.id))

  useEffect(() => {
    refresh()
  }, [activity, refresh])

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Uncommitted changes on <code>{session.branch}</code>
        </p>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
      <AsyncView result={diff} errorTitle="Could not read the worktree">
        {(value) =>
          value.files.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing to commit. Approved changes show up here.
            </p>
          ) : (
            <>
              <CommitForm
                session={session}
                files={value.files.length}
                counts={countChanges(value.files.flatMap((file) => file.hunks))}
              />
              {value.files.map((file) => (
                <FileDiffView key={file.filePath} file={file} />
              ))}
            </>
          )
        }
      </AsyncView>
    </div>
  )
}

function CommitForm({
  session,
  files,
  counts,
}: {
  readonly session: Session
  readonly files: number
  readonly counts: { readonly added: number; readonly removed: number }
}) {
  const commit = useAtomSet(commitAtom, { mode: "promiseExit" })
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [committed, setCommitted] = useState<string>()
  const busy = isBusy(session.status)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (message.trim() === "" || pending) return
    setPending(true)
    setError(undefined)
    const exit = await commit({
      payload: { sessionId: session.id, message: message.trim() },
      reactivityKeys: [keys.sessionDiff(session.id), keys.git(session.projectId)],
    })
    setPending(false)
    if (Exit.isSuccess(exit)) {
      setCommitted(exit.value)
      setMessage("")
    } else {
      setError(describeCause(exit.cause))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm">
        <GitCommitHorizontal className="size-4" />
        <span className="font-medium">
          Commit {files} file{files === 1 ? "" : "s"}
        </span>
        <ChangeCount {...counts} />
      </div>
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Commit message"
        rows={2}
        aria-label="Commit message"
      />
      <div className="flex items-center justify-end gap-2">
        {busy && (
          <span className="mr-auto text-xs text-muted-foreground">
            Wait for the agent to finish before committing.
          </span>
        )}
        <Button type="submit" disabled={busy || pending || message.trim() === ""}>
          {pending ? "Committing…" : `Commit to ${session.branch}`}
        </Button>
      </div>
      {committed !== undefined && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Committed {committed}.</p>
      )}
      {error !== undefined && <ErrorNote title="The commit failed" message={error} />}
    </form>
  )
}
