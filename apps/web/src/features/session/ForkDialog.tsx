import type { Session } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { GitFork } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { keys } from "@/lib/rpc"
import type { TurnEnd } from "@/features/chat/transcriptActions"
import { forkAtom } from "./atoms.ts"
import { useAction } from "@/lib/useAction"

export interface ForkTarget {
  readonly turn?: TurnEnd | undefined
}

export function ForkDialog({
  session,
  target,
  onClose,
}: {
  readonly session: Session
  readonly target: ForkTarget | undefined
  readonly onClose: () => void
}) {
  const { run: fork, error, setError, pending } = useAction(forkAtom)
  const navigate = useNavigate()
  const turn = target?.turn
  const message = turn?.nextMessage
  const busy = session.status === "running" || session.status === "waiting_for_human"

  const close = () => {
    setError(undefined)
    onClose()
  }

  const run = async () => {
    const exit = await fork({
      payload: {
        sessionId: session.id,
        ...(message === undefined ? {} : { messageId: message.id }),
      },
      reactivityKeys: [keys.sessions(session.projectId)],
    })
    if (Exit.isFailure(exit)) return
    close()
    void navigate({
      to: "/projects/$projectId/sessions/$sessionId",
      params: { projectId: exit.value.projectId, sessionId: exit.value.id },
    })
  }

  return (
    <Dialog open={target !== undefined} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="size-4" />
            {turn === undefined ? "Fork this thread?" : "Fork from this response?"}
          </DialogTitle>
          {turn !== undefined && turn.reply !== "" && (
            <DialogDescription className="line-clamp-2 wrap-anywhere">
              “{turn.reply}”
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          <p>
            {turn === undefined
              ? "A new thread starts in a worktree of its own, with this thread’s files as they are now and its whole conversation."
              : message === undefined
                ? "A new thread starts in a worktree of its own, with this thread’s files as they are now and the conversation up to this response."
                : "A new thread starts in a worktree of its own, with the files as they were before your next message and the conversation up to this response."}{" "}
            This thread stays as it is.
          </p>
          <p className="text-muted-foreground">
            The new thread’s agent gets that conversation as context with your first message there,
            and runs in the project’s default permissions.
          </p>
        </div>
        {busy && (
          <p className="text-sm text-warning">
            The agent is working. Stop it, or wait until it is done, before forking.
          </p>
        )}
        {error !== undefined && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy || pending} onClick={() => void run()}>
            {pending && <Spinner />}
            Fork
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
