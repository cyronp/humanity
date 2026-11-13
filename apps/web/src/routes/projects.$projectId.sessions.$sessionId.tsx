import { useAtomValue } from "@effect/atom-react"
import { type Project, SessionId } from "@humanity/contracts"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Skeleton } from "@/components/ui/skeleton"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { useProject } from "@/features/projects/useProject"
import { sessionViewAtom } from "@/features/session/atoms"
import { Workspace } from "@/features/session/Workspace"
import { describeCause } from "@/lib/errors"

/** `?file=<path>` deep-links to a file change waiting for an answer. */
const WorkspaceSearch = Schema.Struct({
  file: Schema.optional(Schema.String),
})

export const Route = createFileRoute("/projects/$projectId/sessions/$sessionId")({
  validateSearch: (search: Record<string, unknown>) =>
    Schema.decodeUnknownSync(WorkspaceSearch)(
      typeof search["file"] === "string" ? { file: search["file"] } : {},
    ),
  component: SessionRoute,
})

function SessionRoute() {
  const { projectId, sessionId } = Route.useParams()
  const project = useProject(projectId)
  return (
    <AsyncView result={project} errorTitle="Could not load the project">
      {(value) =>
        value === null ? (
          <p className="p-6 pt-14 text-sm text-muted-foreground">This project does not exist.</p>
        ) : (
          <LiveSession project={value} sessionId={SessionId.make(sessionId)} />
        )
      }
    </AsyncView>
  )
}

function LiveSession({
  project,
  sessionId,
}: {
  readonly project: Project
  readonly sessionId: SessionId
}) {
  const result = useAtomValue(sessionViewAtom(sessionId))
  const search = Route.useSearch()
  const view = AsyncResult.isSuccess(result) ? result.value : undefined

  if (AsyncResult.isFailure(result) && view === undefined) {
    return (
      <div className="p-6 pt-14">
        <AppHeader>
          <ProjectBreadcrumb project={project} />
        </AppHeader>
        <ErrorNote title="Could not open the session" message={describeCause(result.cause)} />
      </div>
    )
  }
  if (view === undefined) {
    return (
      <div className="flex flex-col gap-3 p-6 pt-14" aria-busy="true">
        <AppHeader>
          <ProjectBreadcrumb project={project} />
        </AppHeader>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  return <Workspace project={project} view={view} search={search} />
}
