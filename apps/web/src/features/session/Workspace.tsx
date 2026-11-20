import {
  acceptsMessages,
  parseQuestions,
  type Project,
  QUESTION_TOOL,
  type TerminalOwner,
} from "@humanity/contracts"
import { useEffect, useMemo, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useBrowser } from "@/features/browser/useBrowser"
import { KeyHint, useKeyHintShown } from "@/features/chat/ChatBox"
import { Composer, type ComposerHandle } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { WorkspaceFrame } from "@/features/layout/WorkspaceFrame"
import { QuestionPanel } from "@/features/questions/QuestionPanel"
import { ChangeCards } from "@/features/review/ChangeCards"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { ToolPanel, ToolRail } from "./panel/SessionPanel.tsx"
import { SessionHeader } from "./SessionHeader.tsx"
import {
  approvalsByToolUse,
  isBusy,
  pendingChanges,
  pendingConfirmations,
  type SessionView,
} from "./state.ts"
import { HINT_CLASS, UsageMeters } from "./UsageMeters.tsx"
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

  const activity = Object.keys(view.toolCalls).length + view.approvals.length
  const composer = useRef<ComposerHandle>(null)
  const canReference = acceptsMessages(session) && questions === undefined
  const terminalOwner = useMemo(
    (): TerminalOwner => ({ _tag: "Session", sessionId: session.id }),
    [session.id],
  )

  const browser = useBrowser(session.id, view.toolCalls)

  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [typing, setTyping] = useState(false)
  const keyHint = useKeyHintShown()
  const [dockHeight, setDockHeight] = useState(0)
  useEffect(() => {
    if (dock === null) return
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

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
    <WorkspaceFrame
      terminals={{
        owner: terminalOwner,
        unavailable: session.status === "ended" ? "This thread has ended." : undefined,
      }}
      header={(actions) => <SessionHeader project={project} session={session} actions={actions} />}
      rail={(shelf, onSelect) => (
        <ToolRail
          session={session}
          shelf={shelf}
          browserUnseen={browser.unseen}
          onSelect={onSelect}
        />
      )}
      panel={({ tool, onClose }) => (
        <ToolPanel
          key={session.id}
          session={session}
          activity={activity}
          tool={tool}
          browser={browser}
          onClose={onClose}
          onCapture={
            canReference
              ? {
                  block: (text) => composer.current?.insert({ kind: "block", text }),
                  attach: (files) => composer.current?.attach(files),
                }
              : undefined
          }
          onReference={
            canReference
              ? (reference) => composer.current?.insert({ kind: "reference", reference })
              : undefined
          }
        />
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
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
          {/* The @ menu opens upward from the chat box: while it is open nothing may clip it. */}
          <div className="max-h-[calc(100svh-3.5rem)] shrink-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto has-[[data-slot=file-mention-menu]]:overflow-visible">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 *:pointer-events-auto">
              <UsageMeters
                sessionId={session.id}
                usage={view.usage}
                hint={
                  keyHint && (asked === undefined || questions === undefined) ? (
                    <KeyHint typing={typing} className={HINT_CLASS} />
                  ) : undefined
                }
              />
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
                  onTypingChange={setTyping}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceFrame>
  )
}
