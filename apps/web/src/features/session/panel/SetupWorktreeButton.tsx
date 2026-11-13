import { useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { Exit } from "effect"
import { GitBranchPlus, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { setupWorktreeAtom } from "../atoms.ts"
import { isBusy } from "../state.ts"

/**
 * Moves a session that works in the project's checkout into its own branch
 * and worktree. Hidden once it has one; disabled while the agent works.
 */
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
        keys.publication(session.id),
      ],
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  const hint =
    error ??
    (busy
      ? "Available once the agent finishes its turn."
      : `The agent works in your checkout on ${session.branch}. Give it its own branch and worktree from here; uncommitted changes stay in your checkout.`)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span keeps the tooltip working while the button is disabled. */}
        <span tabIndex={busy ? 0 : -1}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={busy || pending}
            className={error === undefined ? undefined : "text-red-600 dark:text-red-400"}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : <GitBranchPlus />}
            {pending ? "Setting up…" : "Set up worktree"}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  )
}
