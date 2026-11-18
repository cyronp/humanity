import { useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { Exit } from "effect"
import { GitBranchPlus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { setupWorktreeAtom } from "../atoms.ts"
import { isBusy } from "../state.ts"

export function SetupWorktreeButton({ session }: { readonly session: Session }) {
  const setup = useAtomSet(setupWorktreeAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  if (session.inWorktree || session.status === "ended") return null
  const busy = isBusy(session.status)

  const onClick = async () => {
    setPending(true)
    setError(undefined)
    const exit = await setup({
      payload: { sessionId: session.id },
      reactivityKeys: [
        keys.sessions(session.projectId),
        keys.git(session.projectId),
        keys.sessionDiff(session.id),
        keys.sessionCommits(session.id),
        keys.publication(session.id),
      ],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  const hint =
    error ??
    (busy
      ? "Available when the agent finishes."
      : `Move this thread off ${session.branch} into its own branch and worktree. Uncommitted changes stay in your checkout.`)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={busy ? 0 : -1}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={busy || pending}
            className={error === undefined ? undefined : "text-destructive"}
          >
            {pending ? <Spinner className="size-3.5" /> : <GitBranchPlus />}
            {pending ? "Setting up…" : "Set up worktree"}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  )
}
