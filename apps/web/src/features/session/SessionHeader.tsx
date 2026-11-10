import { useAtomSet } from "@effect/atom-react"
import type { Project, Session } from "@humanity/contracts"
import { Exit } from "effect"
import { Square, TriangleAlert } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { describeCause } from "@/lib/errors"
import { interruptAtom } from "./atoms.ts"
import { isBusy } from "./state.ts"

/**
 * The session's part of the app header: `project ▾ / title`, the page's own
 * `actions`, and Interrupt while the agent works. Status, branch and the End
 * button live on the session's row in the sidebar.
 */
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
    setError(undefined)
    const exit = await interrupt({ payload: { sessionId: session.id } })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <AppHeader
      actions={
        <>
          {error !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="alert"
                  className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                >
                  <TriangleAlert className="size-3.5" />
                  Could not interrupt
                </span>
              </TooltipTrigger>
              <TooltipContent>{error}</TooltipContent>
            </Tooltip>
          )}
          {actions}
          {isBusy(session.status) && (
            <Button variant="outline" size="sm" onClick={onInterrupt}>
              <Square />
              Interrupt
            </Button>
          )}
        </>
      }
    >
      <ProjectBreadcrumb project={project} page={session.title} />
    </AppHeader>
  )
}
