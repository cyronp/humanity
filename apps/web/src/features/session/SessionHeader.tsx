import type { Project, Session } from "@humanity/contracts"
import type { ReactNode } from "react"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"

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
