import { useAtomSet } from "@effect/atom-react"
import { type CompareRun, type GroupComparison, totalTokens } from "@humanity/contracts"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { Columns3, ExternalLink, Trophy } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Markdown } from "@/features/chat/Markdown"
import { ChangeCount, FileDiffView } from "@/features/diff/FileDiffView"
import { useProject } from "@/features/projects/atoms"
import { ProviderIcon } from "@/features/providers/ProviderIcon"
import { compareGroupAtom, endSessionAtom } from "@/features/session/atoms"
import { ThreadStatus } from "@/features/sidebar/ThreadLink"
import { formatCost, formatCount } from "@/features/usage/usage"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { closeCompare, runChanges, sharedFiles, useCompareOpen } from "./compare.ts"

const REFRESH_MS = 4000

export function CompareDialog() {
  const groupId = useCompareOpen()
  return (
    <Dialog open={groupId !== undefined} onOpenChange={(open) => !open && closeCompare()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns3 className="size-4" />
            Compare runs
          </DialogTitle>
          <DialogDescription>
            The same prompt on each model, each in a worktree of its own, from the same commit.
          </DialogDescription>
        </DialogHeader>
        {groupId !== undefined && <Comparison key={groupId} groupId={groupId} />}
      </DialogContent>
    </Dialog>
  )
}

function Comparison({ groupId }: { readonly groupId: string }) {
  const load = useAtomSet(compareGroupAtom, { mode: "promiseExit" })
  const [state, setState] = useState<{
    readonly comparison?: GroupComparison
    readonly error?: string
  }>()
  const [keeping, setKeeping] = useState<CompareRun>()

  const working =
    state?.comparison?.runs.some(
      (run) => run.session.status === "running" || run.session.status === "waiting_for_human",
    ) ?? true

  useEffect(() => {
    let current = true
    const fetchNow = () =>
      void load({ payload: { groupId } }).then((exit) => {
        if (!current) return
        setState(
          Exit.isSuccess(exit) ? { comparison: exit.value } : { error: describeCause(exit.cause) },
        )
      })
    fetchNow()
    const timer = working ? setInterval(fetchNow, REFRESH_MS) : undefined
    return () => {
      current = false
      if (timer !== undefined) clearInterval(timer)
    }
  }, [groupId, load, working])

  if (state === undefined) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Spinner /> Reading the runs…
      </div>
    )
  }
  if (state.error !== undefined || state.comparison === undefined) {
    return <p className="text-sm text-destructive">{state.error}</p>
  }
  const { runs } = state.comparison
  const shared = sharedFiles(runs)
  return (
    <>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${runs.length}, minmax(14rem, 1fr))` }}
      >
        {runs.map((run) => (
          <RunColumn
            key={run.session.id}
            run={run}
            shared={shared}
            onKeep={
              runs.length > 1 && run.session.status !== "ended" ? () => setKeeping(run) : undefined
            }
          />
        ))}
      </div>
      <KeepDialog
        kept={keeping}
        others={runs.filter(
          (run) => run.session.id !== keeping?.session.id && run.session.status !== "ended",
        )}
        onClose={() => setKeeping(undefined)}
      />
    </>
  )
}

function RunColumn({
  run,
  shared,
  onKeep,
}: {
  readonly run: CompareRun
  readonly shared: ReadonlySet<string>
  readonly onKeep: (() => void) | undefined
}) {
  const navigate = useNavigate()
  const [openFile, setOpenFile] = useState<string>()
  const changes = runChanges(run)
  const cost = formatCost(run.amount)
  const { session } = run
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ProviderIcon provider={session.provider} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={session.title}>
            {session.model ?? "Default model"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <ThreadStatus status={session.status} />
          <span>{formatCount(totalTokens(run.amount))} tokens</span>
          {cost !== undefined && <span>{cost}</span>}
          <span>
            {run.amount.turns} turn{run.amount.turns === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <div className="flex flex-col gap-1">
        <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Changes
          {changes !== undefined && changes.files > 0 && (
            <>
              <span>
                {changes.files} file{changes.files === 1 ? "" : "s"}
              </span>
              <ChangeCount added={changes.added} removed={changes.removed} />
            </>
          )}
        </h4>
        {run.diff === null ? (
          <p className="text-xs text-muted-foreground">Not available for this run.</p>
        ) : run.diff.files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No files changed yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {run.diff.files.map((file) => (
              <FileDiffView
                key={file.filePath}
                file={file}
                open={openFile === file.filePath}
                onOpenChange={(open) => setOpenFile(open ? file.filePath : undefined)}
                headerActions={
                  shared.has(file.filePath) ? (
                    <span
                      className="text-[0.6875rem] text-muted-foreground"
                      title="Another run changed this file too"
                    >
                      also elsewhere
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">Last message</h4>
        {run.lastMessage === null ? (
          <p className="text-xs text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
            <Markdown text={run.lastMessage} />
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            closeCompare()
            void navigate({
              to: "/projects/$projectId/sessions/$sessionId",
              params: { projectId: session.projectId, sessionId: session.id },
            })
          }}
        >
          <ExternalLink />
          Open thread
        </Button>
        {onKeep !== undefined && (
          <Button size="sm" onClick={onKeep}>
            <Trophy />
            Keep this one
          </Button>
        )}
      </div>
    </section>
  )
}

function KeepDialog({
  kept,
  others,
  onClose,
}: {
  readonly kept: CompareRun | undefined
  readonly others: ReadonlyArray<CompareRun>
  readonly onClose: () => void
}) {
  const end = useAtomSet(endSessionAtom, { mode: "promiseExit" })
  const project = useProject(kept?.session.projectId ?? "")
  const onEnd = project?.settings.worktreeOnEnd ?? "ask"
  const [removeChoice, setRemove] = useState<boolean>()
  const remove = removeChoice ?? onEnd === "remove"
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const confirm = async () => {
    if (kept === undefined) return
    setPending(true)
    setError(undefined)
    for (const run of others) {
      const exit = await end({
        payload: { sessionId: run.session.id, removeWorktree: run.session.inWorktree && remove },
        reactivityKeys: [keys.sessions(run.session.projectId)],
      })
      if (Exit.isFailure(exit)) {
        setPending(false)
        setError(describeCause(exit.cause))
        return
      }
    }
    setPending(false)
    onClose()
    closeCompare()
  }

  return (
    <Dialog open={kept !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keep {kept?.session.model ?? "this run"}?</DialogTitle>
          <DialogDescription>
            The other {others.length === 1 ? "run ends" : `${others.length} runs end`}: their agents
            stop and their threads become read-only. Their branches are kept. This thread goes on as
            any other; nothing is merged.
          </DialogDescription>
        </DialogHeader>
        {onEnd !== "keep" && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="compare-remove-worktrees"
              checked={remove}
              onCheckedChange={(checked) => setRemove(checked === true)}
            />
            <Label htmlFor="compare-remove-worktrees" className="text-sm font-normal">
              Also delete their worktrees, with any uncommitted changes in them
            </Label>
          </div>
        )}
        {error !== undefined && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void confirm()}>
            {pending && <Spinner />}
            Keep it and end the others
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
