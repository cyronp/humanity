import { useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { Exit } from "effect"
import { CircleStop } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { describeCause } from "@/lib/errors"
import { useProject } from "@/features/projects/atoms"
import { keys } from "@/lib/rpc"
import { endSessionAtom } from "./atoms.ts"

export function EndSessionButton({
  session,
  className,
}: {
  readonly session: Session
  readonly className?: string
}) {
  const end = useAtomSet(endSessionAtom, { mode: "promiseExit" })
  const onEnd = useProject(session.projectId)?.settings.worktreeOnEnd ?? "ask"
  const [removeWorktree, setRemoveWorktree] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const removes = onEnd === "ask" ? removeWorktree : onEnd === "remove"

  const confirm = async () => {
    setError(undefined)
    const exit = await end({
      payload: { sessionId: session.id, removeWorktree: session.inWorktree && removes },
      reactivityKeys: [keys.sessions(session.projectId)],
    })
    if (Exit.isSuccess(exit)) setOpen(false)
    else setError(describeCause(exit.cause))
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="muted"
          size="xs"
          className={className}
          aria-label={`End thread “${session.title}”`}
        >
          <CircleStop />
          End thread
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End “{session.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent stops and the thread becomes read-only.{" "}
            {!session.inWorktree ? (
              "Your checkout is left as it is."
            ) : onEnd === "ask" ? (
              <>
                The branch <code>{session.branch}</code> is kept either way.
              </>
            ) : onEnd === "remove" ? (
              <>
                Its worktree is deleted, with any uncommitted changes in it, as this project&apos;s
                settings ask. The branch <code>{session.branch}</code> is kept.
              </>
            ) : (
              <>
                Its worktree and the branch <code>{session.branch}</code> are kept, as this
                project&apos;s settings ask.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {session.inWorktree && onEnd === "ask" && (
          <div className="flex items-center gap-2">
            <Checkbox
              className="size-3.5 [&_svg]:size-3"
              id={`remove-worktree-${session.id}`}
              checked={removeWorktree}
              onCheckedChange={(checked) => setRemoveWorktree(checked === true)}
            />
            <Label htmlFor={`remove-worktree-${session.id}`}>
              Also delete the worktree (uncommitted changes in it are lost)
            </Label>
          </div>
        )}
        {error !== undefined && <ErrorNote title="Could not end the thread" message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm}>
            End thread
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
