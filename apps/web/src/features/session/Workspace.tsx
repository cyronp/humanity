import { acceptsMessages, parseQuestions, type Project, QUESTION_TOOL } from "@humanity/contracts"
import { cn } from "cn"
import { useEffect, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { useAppHeaderInsetEnd } from "@/features/layout/AppHeader"
import { Composer, type ComposerHandle } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { QuestionPanel } from "@/features/questions/QuestionPanel"
import { ChangeCards } from "@/features/review/ChangeCards"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { SessionPanel } from "./panel/SessionPanel.tsx"
import { SessionHeader } from "./SessionHeader.tsx"
import { SetupWorktreeButton } from "./SetupWorktreeButton.tsx"
import { SourceControlButton } from "./SourceControlButton.tsx"
import {
  approvalForToolUse,
  isBusy,
  pendingChanges,
  pendingConfirmations,
  type SessionView,
} from "./state.ts"
import { UsageMeters } from "./UsageMeters.tsx"

export interface WorkspaceSearch {
  readonly file?: string | undefined
}

/**
 * Chat in the middle, with whatever the agent waits on pinned above the
 * message box; the worktree's diff on the right.
 */
export function Workspace({
  project,
  view,
  search,
}: {
  readonly project: Project
  readonly view: SessionView
  readonly search: WorkspaceSearch
}) {
  const { session } = view
  const changes = pendingChanges(view)
  const confirmations = pendingConfirmations(view)
  const waiting = changes.length + confirmations.length
  // The oldest question takes the message box's place; every other call keeps its card.
  const asked = confirmations.find((confirmation) => confirmation.toolName === QUESTION_TOOL)
  const questions = asked === undefined ? undefined : parseQuestions(asked.input)
  const cards =
    questions === undefined ? confirmations : confirmations.filter((each) => each !== asked)
  const [panelOpen, setPanelOpen] = useState(false)
  // Grows whenever the agent may have written files, so what shows them refreshes.
  const activity = Object.keys(view.toolCalls).length + view.approvals.length
  // The diff panel's reference buttons write into the message box.
  const composer = useRef<ComposerHandle>(null)
  const canReference = acceptsMessages(session) && questions === undefined

  // The message box floats over the transcript; the transcript leaves room for its height.
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  useEffect(() => {
    if (dock === null) return
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

  // Beside the chat, the panel runs to the top and the header ends where it
  // begins. Alone on a narrow screen, the header keeps the full width.
  const [panel, setPanel] = useState<HTMLElement | null>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)
  useEffect(() => {
    const row = panel?.parentElement
    if (panel === null || row === null || row === undefined) return
    // The observer also reports once as soon as it starts.
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

  // A blocked agent is visible from other tabs too.
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
          <>
            <SetupWorktreeButton session={session} />
            <SourceControlButton
              session={session}
              open={panelOpen}
              onToggle={() => setPanelOpen((open) => !open)}
            />
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className={cn("relative flex min-w-0 flex-1 flex-col", panelOpen && "hidden lg:flex")}>
          <div className="min-h-0 flex-1">
            <MessageList
              bottomInset={dockHeight}
              messages={view.messages}
              toolCalls={view.toolCalls}
              draft={view.draft}
              working={session.status === "running"}
              approvalFor={(toolUseId) => approvalForToolUse(view, toolUseId)}
              worktreePath={session.worktreePath}
              empty={
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Ask the agent about this repository. How much it does without asking is this
                  thread's permissions, next to the message box.
                </p>
              }
              footer={
                view.error !== null ? (
                  <ErrorNote title="The agent stopped" message={view.error} />
                ) : undefined
              }
            />
          </div>
          {/*
            Floats over the transcript, which scrolls behind the message box.
            It stops below the app header: when what waits for the human is
            taller than that, its cards scroll and the message box stays put.
            Both parts reserve the same scrollbar gutter as the transcript, so
            all three centre on the same column.
          */}
          <div
            ref={setDock}
            className="pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[calc(100%-3.5rem)] flex-col"
          >
            {(cards.length > 0 || changes.length > 0) && (
              <div className="min-h-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4 *:pointer-events-auto">
                  {cards.map((confirmation) => (
                    // A solid base: the card's own amber tint is see-through.
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
              // Alone on a narrow screen, it sits under the full-width header.
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
