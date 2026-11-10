import { useAtomValue } from "@effect/atom-react"
import { type Project, SessionId } from "@humanity/contracts"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useRef } from "react"
import { AsyncView } from "@/components/AsyncView"
import { ErrorNote } from "@/components/ErrorNote"
import { Skeleton } from "@/components/ui/skeleton"
import { Composer } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { useProject } from "@/features/projects/useProject"
import { sessionViewAtom } from "@/features/session/atoms"
import { SessionHeader } from "@/features/session/SessionHeader"
import { isBusy, type SessionView } from "@/features/session/state"
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
  component: SessionWorkspace,
})

function SessionWorkspace() {
  const { projectId, sessionId } = Route.useParams()
  const project = useProject(projectId)
  return (
    <AsyncView result={project} errorTitle="Could not load the project">
      {(value) =>
        value === null ? (
          <p className="p-6 text-sm text-muted-foreground">This project does not exist.</p>
        ) : (
          <Workspace project={value} sessionId={SessionId.make(sessionId)} />
        )
      }
    </AsyncView>
  )
}

function Workspace({
  project,
  sessionId,
}: {
  readonly project: Project
  readonly sessionId: SessionId
}) {
  const result = useAtomValue(sessionViewAtom(sessionId))
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
  return <Chat project={project} view={view} />
}

function Chat({ project, view }: { readonly project: Project; readonly view: SessionView }) {
  const bottom = useRef<HTMLDivElement>(null)
  const { session } = view

  // Keep the newest output in view as it streams in.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [view.messages.length, view.draft])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHeader project={project} session={session} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
          {view.messages.length === 0 && view.draft === "" && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Ask the agent about this repository. It reads freely; every change it proposes waits
              for you.
            </p>
          )}
          <MessageList messages={view.messages} toolCalls={view.toolCalls} draft={view.draft} />
          {view.error !== null && <ErrorNote title="The agent stopped" message={view.error} />}
          <div ref={bottom} />
        </div>
      </div>
      <div className="border-t bg-background">
        <div className="mx-auto w-full max-w-3xl p-4">
          <Composer
            sessionId={session.id}
            disabled={session.status === "ended"}
            busy={isBusy(session.status)}
          />
        </div>
      </div>
    </div>
  )
}
