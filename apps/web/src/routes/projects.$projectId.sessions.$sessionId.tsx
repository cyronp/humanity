import { useAtomValue } from "@effect/atom-react"
import { type Project, SessionId, type TerminalOwner } from "@humanity/contracts"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { useMemo } from "react"
import { AsyncResult } from "effect/reactivity"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Skeleton } from "@/components/ui/skeleton"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { WorkspaceFrame } from "@/features/layout/WorkspaceFrame"
import { useProject } from "@/features/projects/useProject"
import { sessionViewAtom } from "@/features/session/atoms"
import { Workspace } from "@/features/session/Workspace"
import { describeCause } from "@/lib/errors"

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
  const terminalOwner = useMemo((): TerminalOwner => ({ _tag: "Session", sessionId }), [sessionId])

  if (view !== undefined) return <Workspace project={project} view={view} search={search} />
  const failed = AsyncResult.isFailure(result)
  return (
    <WorkspaceFrame
      terminals={failed ? undefined : { owner: terminalOwner, unavailable: "Opening the thread…" }}
      header={(actions) => (
        <AppHeader actions={actions}>
          <ProjectBreadcrumb project={project} />
        </AppHeader>
      )}
    >
      {AsyncResult.isFailure(result) ? (
        <div className="min-h-0 flex-1 p-6 pt-14">
          <ErrorNote title="Could not open the session" message={describeCause(result.cause)} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-6 pt-14" aria-busy="true">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
    </WorkspaceFrame>
  )
}
