import { useAtomValue } from "@effect/atom-react"
import { type Project, SessionId, type TerminalOwner } from "@humanity/contracts"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { useMemo, useState } from "react"
import { AsyncResult } from "effect/reactivity"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Skeleton } from "@/components/ui/skeleton"
import { AppHeader } from "@/features/layout/AppHeader"
import { ProjectBreadcrumb } from "@/features/layout/ProjectBreadcrumb"
import { WorkspaceFrame } from "@/features/layout/WorkspaceFrame"
import { useProject } from "@/features/projects/useProject"
import { sessionViewAtom } from "@/features/session/atoms"
import type { SessionView } from "@/features/session/state"
import { Workspace, type WorkspaceSearch } from "@/features/session/Workspace"
import { describeCause } from "@/lib/errors"

const WorkspaceSearch = Schema.Struct({
  file: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})

export const Route = createFileRoute("/projects/$projectId/sessions/$sessionId")({
  validateSearch: (search: Record<string, unknown>) =>
    Schema.decodeUnknownSync(WorkspaceSearch)(
      Object.fromEntries(
        (["file", "message"] as const).flatMap((key) =>
          typeof search[key] === "string" ? [[key, search[key]]] : [],
        ),
      ),
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

const NO_SEARCH: WorkspaceSearch = {}

const viewOf = (result: AsyncResult.AsyncResult<SessionView | undefined, unknown>) =>
  AsyncResult.isSuccess(result) ? result.value : undefined

function LiveSession({
  project,
  sessionId,
}: {
  readonly project: Project
  readonly sessionId: SessionId
}) {
  const [shown, setShown] = useState({ project, sessionId })
  const target = useAtomValue(sessionViewAtom(sessionId))
  const held = useAtomValue(sessionViewAtom(shown.sessionId))
  const search = Route.useSearch()
  const terminalOwner = useMemo((): TerminalOwner => ({ _tag: "Session", sessionId }), [sessionId])
  const switching = shown.sessionId !== sessionId
  const settled = viewOf(target) !== undefined || AsyncResult.isFailure(target)
  if (switching ? settled : shown.project !== project) setShown({ project, sessionId })

  const view = viewOf(held)
  if (view !== undefined)
    return (
      <div className="contents" inert={switching} aria-busy={switching || undefined}>
        <Workspace
          key={view.session.id}
          project={shown.project}
          view={view}
          search={switching ? NO_SEARCH : search}
        />
      </div>
    )
  const result = switching ? target : held
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
