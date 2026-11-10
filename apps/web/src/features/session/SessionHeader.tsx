import { useAtomSet } from "@effect/atom-react"
import type { Project, Session } from "@humanity/contracts"
import { Link } from "@tanstack/react-router"
import { Exit } from "effect"
import { CircleStop, FolderGit2, GitBranch, Square } from "lucide-react"
import { type ReactNode, useState } from "react"
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
import { endSessionAtom, interruptAtom } from "./atoms.ts"
import { isBusy } from "./state.ts"
import { StatusBadge } from "./StatusBadge.tsx"

export function SessionHeader({
  project,
  session,
  actions,
}: {
  readonly project: Project
  readonly session: Session
  readonly actions?: ReactNode
}) {
  const interrupt = useAtomSet(interruptAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()

  const onInterrupt = async () => {
    const exit = await interrupt({ payload: { sessionId: session.id } })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <header className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {project.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="truncate font-semibold">{session.title}</h1>
        <StatusBadge status={session.status} />
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {isBusy(session.status) && (
            <Button variant="outline" size="sm" onClick={onInterrupt}>
              <Square />
              Interrupt
            </Button>
          )}
          {session.status !== "ended" && <EndSessionButton session={session} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch className="size-3.5" />
          <code>{session.branch}</code>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex min-w-0 items-center gap-1">
              <FolderGit2 className="size-3.5 shrink-0" />
              <span>worktree</span>
              <code className="truncate">{session.worktreePath}</code>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            The agent works only in this worktree. Your checkout at {project.localPath} is never
            touched.
          </TooltipContent>
        </Tooltip>
      </div>
      {error !== undefined && <ErrorNote title="Could not interrupt" message={error} />}
    </header>
  )
}

function EndSessionButton({ session }: { readonly session: Session }) {
  const end = useAtomSet(endSessionAtom, { mode: "promiseExit" })
  const [removeWorktree, setRemoveWorktree] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()

  const confirm = async () => {
    setError(undefined)
    const exit = await end({
      payload: { sessionId: session.id, removeWorktree },
      reactivityKeys: [keys.sessions(session.projectId)],
    })
    if (Exit.isSuccess(exit)) setOpen(false)
    else setError(describeCause(exit.cause))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <CircleStop />
          End session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this session?</DialogTitle>
          <DialogDescription>
            The agent stops and the session becomes read-only. The branch{" "}
            <code>{session.branch}</code> is kept either way.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            id="remove-worktree"
            type="checkbox"
            checked={removeWorktree}
            onChange={(event) => setRemoveWorktree(event.target.checked)}
            className="size-4"
          />
          <Label htmlFor="remove-worktree">
            Also delete the worktree (uncommitted changes in it are lost)
          </Label>
        </div>
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
