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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { endSessionAtom } from "./atoms.ts"

/** A small icon button that ends `session` after asking, optionally deleting its worktree if it has one. */
export function EndSessionButton({
  session,
  className,
}: {
  readonly session: Session
  readonly className?: string
}) {
  const end = useAtomSet(endSessionAtom, { mode: "promiseExit" })
  const [removeWorktree, setRemoveWorktree] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()

  const confirm = async () => {
    setError(undefined)
    const exit = await end({
      payload: { sessionId: session.id, removeWorktree: session.inWorktree && removeWorktree },
      reactivityKeys: [keys.sessions(session.projectId)],
    })
    if (Exit.isSuccess(exit)) setOpen(false)
    else setError(describeCause(exit.cause))
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              variant="muted"
              size="icon-xs"
              className={className}
              aria-label={`End session “${session.title}”`}
            >
              <CircleStop />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">End session</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End “{session.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent stops and the session becomes read-only.{" "}
            {session.inWorktree ? (
              <>
                The branch <code>{session.branch}</code> is kept either way.
              </>
            ) : (
              "Your checkout is left as it is."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {session.inWorktree && (
          <div className="flex items-center gap-2">
            {/* As small as the box it replaced, so the label stays where it was. */}
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
        {error !== undefined && <ErrorNote title="Could not end the session" message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm}>
            End session
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
