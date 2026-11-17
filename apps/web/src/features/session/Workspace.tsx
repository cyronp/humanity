import { acceptsMessages, parseQuestions, type Project, QUESTION_TOOL } from "@humanity/contracts"
import { cn } from "cn"
import { useEffect, useMemo, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAppHeaderInsetEnd } from "@/features/layout/AppHeader"
import { Composer, type ComposerHandle } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { QuestionPanel } from "@/features/questions/QuestionPanel"
import { ChangeCards } from "@/features/review/ChangeCards"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { SessionPanel } from "./panel/SessionPanel.tsx"
import { SessionHeader } from "./SessionHeader.tsx"
import { SourceControlButton } from "./SourceControlButton.tsx"
import {
  approvalsByToolUse,
  isBusy,
  pendingChanges,
  pendingConfirmations,
  type SessionView,
} from "./state.ts"
import { UsageMeters } from "./UsageMeters.tsx"
import { useTranscript } from "./useTranscript.ts"

export interface WorkspaceSearch {
  readonly file?: string | undefined
}

export function Workspace({
  project,
  view,
  search,
}: {
  readonly project: Project
  readonly view: SessionView
  readonly search: WorkspaceSearch
}) {
  const { session, approvals } = view
  const changes = useMemo(() => pendingChanges(approvals), [approvals])
  const confirmations = useMemo(() => pendingConfirmations(approvals), [approvals])
  const byToolUse = useMemo(() => approvalsByToolUse(approvals), [approvals])
  const transcript = useTranscript(view)
  const waiting = changes.length + confirmations.length
  const asked = confirmations.find((confirmation) => confirmation.toolName === QUESTION_TOOL)
  const questions = asked === undefined ? undefined : parseQuestions(asked.input)
  const cards =
    questions === undefined ? confirmations : confirmations.filter((each) => each !== asked)
  const [panelOpen, setPanelOpen] = useState(false)
  const activity = Object.keys(view.toolCalls).length + view.approvals.length
  const composer = useRef<ComposerHandle>(null)
  const canReference = acceptsMessages(session) && questions === undefined

  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  useEffect(() => {
    if (dock === null) return
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

  const [panel, setPanel] = useState<HTMLElement | null>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)
  useEffect(() => {
    const row = panel?.parentElement
    if (panel === null || row === null || row === undefined) return
    const observer = new ResizeObserver(() => {
      const width = panel.offsetWidth
      setMeasuredWidth(width < row.clientWidth ? width : 0)
    })
    observer.observe(panel)
    observer.observe(row)
    return () => observer.disconnect()
  }, [panel])
  const panelWidth = panel === null ? 0 : measuredWidth
  useAppHeaderInsetEnd(panelWidth)

  useEffect(() => {
    const previous = document.title
    document.title =
      waiting > 0
        ? `(${waiting}) Waiting for you · ${session.title}`
        : `${session.title} · Humanity`
    return () => {
      document.title = previous
    }
  }, [waiting, session.title])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHeader
        project={project}
        session={session}
        actions={
          <SourceControlButton
            session={session}
            open={panelOpen}
            onToggle={() => setPanelOpen((open) => !open)}
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className={cn("relative flex min-w-0 flex-1 flex-col", panelOpen && "hidden lg:flex")}>
          <div className="min-h-0 flex-1">
            <MessageList
              bottomInset={dockHeight}
              messages={transcript.messages}
              toolCalls={transcript.toolCalls}
              draft={view.draft}
              working={session.status === "running"}
              approvals={byToolUse}
              worktreePath={session.worktreePath}
              empty={
                <p className="py-12 text-center text-sm text-muted-foreground">No messages yet.</p>
              }
              earlier={
                transcript.hasEarlier ? (
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={transcript.loading}
                      onClick={() => void transcript.loadEarlier()}
                    >
                      {transcript.loading && <Spinner />}
                      Show earlier messages
                    </Button>
                    {transcript.error !== undefined && (
                      <p className="text-xs text-destructive">{transcript.error}</p>
                    )}
                  </div>
                ) : undefined
              }
              footer={
                view.error !== null ? (
                  <ErrorNote title="The agent stopped" message={view.error} />
                ) : undefined
              }
            />
          </div>
          <div
            ref={setDock}
            className="pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[calc(100%-3.5rem)] flex-col"
          >
            {(cards.length > 0 || changes.length > 0) && (
              <div className="min-h-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4 *:pointer-events-auto">
                  {cards.map((confirmation) => (
                    <div key={confirmation.id} className="rounded-lg bg-background">
                      <ConfirmationCard confirmation={confirmation} />
                    </div>
                  ))}
                  <ChangeCards changes={changes} file={search.file} />
                </div>
              </div>
            )}
            <div className="max-h-[calc(100svh-3.5rem)] shrink-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 *:pointer-events-auto">
                <UsageMeters sessionId={session.id} usage={view.usage} />
                {asked !== undefined && questions !== undefined ? (
                  <QuestionPanel key={asked.id} confirmation={asked} questions={questions} />
                ) : (
                  <Composer
                    ref={composer}
                    sessionId={session.id}
                    projectId={session.projectId}
                    autonomy={session.autonomy}
                    provider={session.provider}
                    model={session.model}
                    effort={session.effort}
                    disabled={!acceptsMessages(session)}
                    busy={isBusy(session.status)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        {panelOpen && (
          <aside
            ref={setPanel}
            className={cn(
              "flex min-h-0 w-full flex-col border-l lg:w-[55%] lg:max-w-4xl",
              panelWidth === 0 && "pt-12",
            )}
          >
            <SessionPanel
              session={session}
              activity={activity}
              onReference={
                canReference
                  ? (reference) => composer.current?.insert({ kind: "reference", reference })
                  : undefined
              }
            />
          </aside>
        )}
      </div>
    </div>
  )
}
