import { useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { CircleStop } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn("text-muted-foreground hover:text-foreground", className)}
              aria-label={`End session “${session.title}”`}
            >
              <CircleStop />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">End session</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End “{session.title}”?</DialogTitle>
          <DialogDescription>
            The agent stops and the session becomes read-only.{" "}
            {session.inWorktree ? (
              <>
                The branch <code>{session.branch}</code> is kept either way.
              </>
            ) : (
              "Your checkout is left as it is."
            )}
          </DialogDescription>
        </DialogHeader>
        {session.inWorktree && (
          <div className="flex items-center gap-2">
            <input
              id={`remove-worktree-${session.id}`}
              type="checkbox"
              checked={removeWorktree}
              onChange={(event) => setRemoveWorktree(event.target.checked)}
              className="size-4"
            />
            <Label htmlFor={`remove-worktree-${session.id}`}>
              Also delete the worktree (uncommitted changes in it are lost)
            </Label>
          </div>
        )}
        {error !== undefined && <ErrorNote title="Could not end the session" message={error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm}>
            End session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
