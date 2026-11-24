import { useAtomSet } from "@effect/atom-react"
import type { ProposedChange } from "@humanity/contracts"
import { countChanges, hunkHeader } from "@humanity/diff"
import { cn } from "cn"
import { Exit } from "effect"
import { useMemo, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { FileTypeIcon } from "@/features/chat/FileTypeIcon"
import { HunkLines, type LineComments } from "@/features/diff/HunkView"
import {
  formatReviewComments,
  pendingChangeKey,
  reviewComments,
  useReviewComments,
} from "@/features/diff/reviewComments"
import { decideChangeAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { DecisionActions, type Verdict } from "./DecisionActions.tsx"
import { DecisionCard } from "./DecisionCard.tsx"

export function ChangeCard({ change }: { readonly change: ProposedChange }) {
  const decide = useAtomSet(decideChangeAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const key = pendingChangeKey(change.id)
  const comments = useReviewComments(key)
  const store = useMemo(() => reviewComments(key), [key])
  const lineComments = useMemo(
    (): LineComments => ({
      list: comments,
      add: store.add,
      update: store.update,
      remove: store.remove,
    }),
    [comments, store],
  )

  const submit = async (verdict: Verdict) => {
    if (pending) return
    setPending(true)
    setError(undefined)
    const denied = verdict.decision === "deny"
    const comment =
      denied && comments.length > 0
        ? [
            verdict.comment,
            formatReviewComments(
              comments,
              `My comments on this change to ${change.filePath} (${comments.length}):`,
            ),
          ]
            .filter((part) => part !== undefined)
            .join("\n\n")
        : verdict.comment
    const exit = await decide({
      payload: {
        changeId: change.id,
        decision: verdict.decision,
        ...(comment === undefined ? {} : { comment }),
        ...(verdict.allowForSession === undefined ? {} : { allowForSession: true as const }),
      },
    })
    setPending(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    if (!denied && comments.length > 0) reviewComments(change.sessionId).addAll(comments)
    store.clear()
  }

  const slash = change.filePath.lastIndexOf("/") + 1
  const created = change.kind === "create"

  return (
    <DecisionCard
      className="scroll-mt-4"
      label={`The agent wants to ${created ? "create" : "change"} ${change.filePath}`}
      data-change-id={change.id}
      kind={<span className="font-mono">{change.toolName}</span>}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <FileTypeIcon path={change.filePath} />
          <span className="min-w-0 truncate font-mono text-sm" title={change.filePath}>
            <span className="text-muted-foreground">{change.filePath.slice(0, slash)}</span>
            <span className="font-medium">{change.filePath.slice(slash)}</span>
          </span>
          {created && (
            <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              New file
            </span>
          )}
        </span>
      }
      aside={<ChangeCount {...countChanges(change.hunks)} />}
      footer={
        <>
          <DecisionActions
            toolName={change.toolName}
            pending={pending}
            onDecide={(verdict) => void submit(verdict)}
            lineComments={comments.length}
            shortcuts
          />
          {comments.length > 0 && (
            <p className="px-0.5 text-xs text-muted-foreground">
              Line comments go to the agent if you deny. If you allow, they wait in Source control,
              under Changes.
            </p>
          )}
          {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
        </>
      }
    >
      <div className="max-h-80 overflow-y-auto border-t bg-background scrollbar-thin">
        {change.hunks.map((hunk, position) => (
          <div key={hunk.index} className={cn(position > 0 && "border-t border-dashed")}>
            {change.hunks.length > 1 && (
              <p className="bg-muted/40 px-3 py-1 font-mono text-[11px] text-muted-foreground">
                {hunkHeader(hunk)}
              </p>
            )}
            <HunkLines hunk={hunk} filePath={change.filePath} comments={lineComments} />
          </div>
        ))}
      </div>
    </DecisionCard>
  )
}
