import type { Project, Session } from "@humanity/contracts"
import { GitFork } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"

export function SessionHeader({
  project,
  session,
  actions,
  onFork,
}: {
  readonly project: Project
  readonly session: Session
  readonly actions?: ReactNode
  readonly onFork?: (() => void) | undefined
}) {
  return (
    <AppHeader
      actions={
        <>
          {onFork !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="muted" size="icon" aria-label="Fork thread" onClick={onFork}>
                  <GitFork />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fork thread</TooltipContent>
            </Tooltip>
          )}
          {actions}
        </>
      }
    >
      <ProjectBreadcrumb project={project} page={session.title} />
    </AppHeader>
  )
}
