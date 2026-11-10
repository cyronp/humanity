import type { Project } from "@humanity/contracts"
import { cn } from "cn"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { useEffect, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Composer } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { ConfirmationCard } from "@/features/review/ConfirmationCard"
import { ReviewPanel } from "@/features/review/ReviewPanel"
import { TimelinePanel } from "@/features/timeline/TimelinePanel"
import { ChangesPanel } from "./ChangesPanel.tsx"
import { SessionHeader } from "./SessionHeader.tsx"
import {
  approvalForToolUse,
  isBusy,
  pendingChanges,
  pendingConfirmations,
  type SessionView,
} from "./state.ts"

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
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className={cn("flex min-w-0 flex-1 flex-col", panelOpen && "hidden lg:flex")}>
          <div className="min-h-0 flex-1">
            <MessageList
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
          <div className="border-t bg-background">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
              {confirmations.map((confirmation) => (
                <ConfirmationCard key={confirmation.id} confirmation={confirmation} />
              ))}
              {changes.length > 0 && !panelOpen && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="rounded-lg border-2 border-amber-500 bg-amber-500/5 p-3 text-left text-sm font-medium"
                >
                  The agent is waiting for your review of {changes.length} change
                  {changes.length === 1 ? "" : "s"}. Open the review panel.
                </button>
              )}
              <Composer
                sessionId={session.id}
                disabled={session.status === "ended"}
                busy={isBusy(session.status)}
              />
            </div>
          </div>
        </div>
        {panelOpen && (
          <aside className="flex min-h-0 w-full flex-col border-l lg:w-[55%] lg:max-w-4xl">
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
              <TabsContent value="review" className="min-h-0 flex-1 overflow-y-auto">
                <ReviewPanel
                  changes={changes}
                  file={search.file}
                  hunk={search.hunk}
                  onFocusChange={(file, hunk) => onSearchChange({ file, hunk })}
                />
              </TabsContent>
              <TabsContent value="timeline" className="min-h-0 flex-1 overflow-y-auto">
                <TimelinePanel view={view} />
              </TabsContent>
              <TabsContent value="changes" className="min-h-0 flex-1 overflow-y-auto">
                <ChangesPanel
                  session={session}
                  activity={Object.keys(view.toolCalls).length + view.approvals.length}
                />
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>
    </div>
  )
}
