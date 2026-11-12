import { acceptsMessages, parseQuestions, type Project, QUESTION_TOOL } from "@humanity/contracts"
import { cn } from "cn"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { useEffect, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Composer } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { QuestionPanel } from "@/features/questions/QuestionPanel"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { ReviewPanel } from "@/features/review/ReviewPanel"
import { TimelinePanel } from "@/features/timeline/TimelinePanel"
import { ChangesPanel } from "./ChangesPanel.tsx"
import { SessionHeader } from "./SessionHeader.tsx"
import { SetupWorktreeButton } from "./SetupWorktreeButton.tsx"
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
  readonly hunk?: number | undefined
}

/** Chat in the middle; review and timeline tabs on the right. */
export function Workspace({
  project,
  view,
  search,
  onSearchChange,
}: {
  readonly project: Project
  readonly view: SessionView
  readonly search: WorkspaceSearch
  readonly onSearchChange: (search: WorkspaceSearch) => void
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
  const [panelOpen, setPanelOpen] = useState(changes.length > 0 || search.file !== undefined)
  const [tab, setTab] = useState("review")

  // A new change to review opens the panel on the review tab.
  const pendingCount = changes.length
  const [seenPending, setSeenPending] = useState(pendingCount)
  if (pendingCount !== seenPending) {
    setSeenPending(pendingCount)
    if (pendingCount > seenPending) {
      setPanelOpen(true)
      setTab("review")
    }
  }

  // The message box floats over the transcript; the transcript leaves room for its height.
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  useEffect(() => {
    if (dock === null) return
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPanelOpen((open) => !open)}
              aria-expanded={panelOpen}
            >
              {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
              Review
              {changes.length > 0 && (
                <Badge className="bg-amber-500 text-black">{changes.length}</Badge>
              )}
            </Button>
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
                  Ask the agent about this repository. It reads freely; every change it proposes
                  waits for you.
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
            Floats over the transcript, which scrolls behind the message box. It
            reserves the same scrollbar gutter as the transcript, so both centre
            on the same column.
          */}
          <div
            ref={setDock}
            className="pointer-events-none absolute inset-x-0 bottom-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 *:pointer-events-auto">
              {cards.map((confirmation) => (
                // A solid base: the card's own amber tint is see-through.
                <div key={confirmation.id} className="rounded-lg bg-background">
                  <ConfirmationCard confirmation={confirmation} />
                </div>
              ))}
              {changes.length > 0 && !panelOpen && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="rounded-lg border-2 border-amber-500 bg-background bg-linear-to-b from-amber-500/5 to-amber-500/5 p-3 text-left text-sm font-medium"
                >
                  The agent is waiting for your review of {changes.length} change
                  {changes.length === 1 ? "" : "s"}. Open the review panel.
                </button>
              )}
              <UsageMeters sessionId={session.id} usage={view.usage} />
              {asked !== undefined && questions !== undefined ? (
                <QuestionPanel key={asked.id} confirmation={asked} questions={questions} />
              ) : (
                <Composer
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
        {panelOpen && (
          <aside className="flex min-h-0 w-full flex-col border-l pt-12 lg:w-[55%] lg:max-w-4xl">
            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className="m-2">
                <TabsTrigger value="review">
                  Review
                  {changes.length > 0 && (
                    <Badge className="ml-1 bg-amber-500 text-black">{changes.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="changes">Changes</TabsTrigger>
              </TabsList>
              <TabsContent value="review" asChild>
                <ScrollArea className="min-h-0 flex-1">
                  <ReviewPanel
                    changes={changes}
                    file={search.file}
                    hunk={search.hunk}
                    onFocusChange={(file, hunk) => onSearchChange({ file, hunk })}
                  />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="timeline" asChild>
                <ScrollArea className="min-h-0 flex-1">
                  <TimelinePanel view={view} />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="changes" asChild>
                <ScrollArea className="min-h-0 flex-1">
                  <ChangesPanel
                    session={session}
                    activity={Object.keys(view.toolCalls).length + view.approvals.length}
                  />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>
    </div>
  )
}
