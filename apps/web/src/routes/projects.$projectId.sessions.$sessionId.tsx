import { useAtomValue } from "@effect/atom-react"
import { type Project, SessionId } from "@humanity/contracts"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Skeleton } from "@/components/ui/skeleton"
import { useProject } from "@/features/projects/useProject"
import { sessionViewAtom } from "@/features/session/atoms"
import { Workspace } from "@/features/session/Workspace"
import { describeCause } from "@/lib/errors"

/** `?file=<path>&hunk=<n>` deep-links to a hunk under review. */
const WorkspaceSearch = Schema.Struct({
  file: Schema.optional(Schema.String),
  hunk: Schema.optional(Schema.Int),
})

export const Route = createFileRoute("/projects/$projectId/sessions/$sessionId")({
  validateSearch: (search: Record<string, unknown>) =>
    Schema.decodeUnknownSync(WorkspaceSearch)({
      ...(typeof search["file"] === "string" ? { file: search["file"] } : {}),
      ...(search["hunk"] !== undefined && Number.isInteger(Number(search["hunk"]))
        ? { hunk: Number(search["hunk"]) }
        : {}),
    }),
  component: SessionRoute,
})

function SessionRoute() {
  const { projectId, sessionId } = Route.useParams()
  const project = useProject(projectId)
  return (
    <AsyncView result={project} errorTitle="Could not load the project">
      {(value) =>
        value === null ? (
          <p className="p-6 text-sm text-muted-foreground">This project does not exist.</p>
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
  const navigate = useNavigate({ from: Route.fullPath })
  const view = AsyncResult.isSuccess(result) ? result.value : undefined

  if (AsyncResult.isFailure(result) && view === undefined) {
    return (
      <div className="p-6">
        <ErrorNote title="Could not open the session" message={describeCause(result.cause)} />
      </div>
    )
  }
  if (view === undefined) {
    return (
      <div className="flex flex-col gap-3 p-6" aria-busy="true">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  return (
    <Workspace
      project={project}
      view={view}
      search={search}
      onSearchChange={(next) =>
        void navigate({
          search: {
            ...(next.file === undefined ? {} : { file: next.file }),
            ...(next.hunk === undefined ? {} : { hunk: next.hunk }),
          },
          replace: true,
        })
      }
    />
  )
}
