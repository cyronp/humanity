import type { Project, Session } from "@humanity/contracts"
import type { ReactNode } from "react"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"

/**
 * The session's part of the app header: `project ▾ / title` and the page's own
 * `actions`. Status, branch and the End button live on the session's row in the
 * sidebar; the agent is stopped from the chat's composer.
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
  return (
    <AppHeader actions={actions}>
      <ProjectBreadcrumb project={project} page={session.title} />
    </AppHeader>
  )
}
