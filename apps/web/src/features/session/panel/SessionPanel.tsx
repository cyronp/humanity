import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { FileDiff, GitCommitHorizontal, GitPullRequest, RefreshCw } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { publicationAtom, refreshPullRequestAtom, sessionDiffAtom } from "../atoms.ts"
import { CommitTab } from "./CommitTab.tsx"
import { DiffTab } from "./DiffTab.tsx"
import { PullRequestTab } from "./PullRequestTab.tsx"
import { SetupWorktreeButton } from "./SetupWorktreeButton.tsx"

type PanelTab = "diff" | "commit" | "pull-request"

const TABS: ReadonlyArray<{
  readonly value: PanelTab
  readonly label: string
  readonly icon: ReactNode
}> = [
  { value: "diff", label: "Changes", icon: <FileDiff /> },
  { value: "commit", label: "Commit and push", icon: <GitCommitHorizontal /> },
  { value: "pull-request", label: "Pull request", icon: <GitPullRequest /> },
]

/**
 * The side panel of a session: what changed where it works, committing and
 * publishing it, and the pull request that follows, one tab each. Its title
 * bar offers a worktree of its own while the session works in the checkout.
 */
export function SessionPanel({
  session,
  activity,
  onReference,
}: {
  readonly session: Session
  /** Changes whenever the agent may have written files, to refresh what the panel shows. */
  readonly activity: number
  /** Puts a `path:line` reference in the message box; absent when no box can take it. */
  readonly onReference?: ((reference: string) => void) | undefined
}) {
  const [tab, setTab] = useState<PanelTab>("diff")
  // Files opened in the changes tab; the tab itself unmounts while another shows.
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(new Set())
  const setFileOpen = (key: string, open: boolean) =>
    setOpenFiles((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  const refreshDiff = useAtomRefresh(sessionDiffAtom(session.id))
  const refreshPublication = useAtomRefresh(publicationAtom(session.id))
  const refreshPullRequest = useAtomSet(refreshPullRequestAtom)

  // Both come from git on this machine: no forge is asked as the agent works.
  useEffect(() => {
    refreshDiff()
    refreshPublication()
  }, [activity, refreshDiff, refreshPublication])

  const refresh = () => {
    refreshDiff()
    refreshPublication()
    // Only this asks the forge, and only once for everyone watching the branch.
    refreshPullRequest({ payload: { sessionId: session.id } })
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as PanelTab)}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      {/* The panel's own title bar, level with the app header beside it. */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
        {/* The open tab is underlined on the bar's bottom edge, as in VS Code. */}
        <TabsList
          aria-label="Panel"
          variant="line"
          className="self-stretch p-0 group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {TABS.map(({ value, label, icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              aria-label={label}
              className="h-full flex-none px-0 text-muted-foreground group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]"
            >
              {/*
                The tooltip sits inside the tab: as the tab's own trigger, its
                `data-state` would replace the tab's, and no tab would look open.
              */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-full items-center px-2.5">{icon}</span>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-1">
          <SetupWorktreeButton session={session} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      <TabsContent value="diff" asChild>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <DiffTab
              session={session}
              onReference={onReference}
              open={openFiles}
              onOpenChange={setFileOpen}
            />
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="commit" asChild>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <CommitTab session={session} onOpenPullRequest={() => setTab("pull-request")} />
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="pull-request" asChild>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <PullRequestTab session={session} onOpenCommit={() => setTab("commit")} />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
