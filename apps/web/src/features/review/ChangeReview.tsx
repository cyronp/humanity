import { useAtomSet } from "@effect/atom-react"
import type { Hunk, ProposedChange } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { cn } from "cn"
import { Exit } from "effect"
import { Check, FilePlus, FileDiff as FileDiffIcon, Send, X } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { HunkView } from "@/features/diff/HunkView"
import { decideChangeAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import type { ReviewDrafts, Verdict } from "./useReviewDrafts.ts"

export const hunkKey = (changeId: string, index: number) => `${changeId}:${index}`

export interface ReviewRefs {
  readonly hunks: Map<string, HTMLElement>
  readonly comments: Map<string, HTMLTextAreaElement>
}

/** One proposed file change: every hunk with its verdict, and a single submit for all of them. */
export function ChangeReview({
  change,
  drafts,
  focusedIndex,
  onFocusHunk,
  refs,
}: {
  readonly change: ProposedChange
  readonly drafts: ReviewDrafts
  readonly focusedIndex: number | undefined
  readonly onFocusHunk: (index: number) => void
  readonly refs: ReviewRefs
}) {
  const decide = useAtomSet(decideChangeAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const decisions = drafts.decisionsFor(change)
  const decidedCount = change.hunks.filter(
    (hunk) => drafts.draftFor(change.id, hunk.index).decision !== undefined,
  ).length

  const submit = async () => {
    if (decisions === undefined || pending) return
    setPending(true)
    setError(undefined)
    const exit = await decide({ payload: { changeId: change.id, decisions } })
    setPending(false)
    if (Exit.isSuccess(exit)) drafts.clear(change.id)
    else setError(describeCause(exit.cause))
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={`Proposed change to ${change.filePath}`}
      data-change-id={change.id}
    >
      <header className="flex flex-wrap items-center gap-2">
        {change.kind === "create" ? (
          <FilePlus className="size-4 text-muted-foreground" />
        ) : (
          <FileDiffIcon className="size-4 text-muted-foreground" />
        )}
        <code className="font-mono text-sm break-all">{change.filePath}</code>
        <Badge variant="outline">{change.kind === "create" ? "new file" : change.toolName}</Badge>
        <ChangeCount {...countChanges(change.hunks)} />
        <span className="ml-auto text-xs text-muted-foreground">
          {decidedCount}/{change.hunks.length} decided
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => drafts.decideAll(change, "approved")}>
          <Check />
          Approve all
        </Button>
        <Button size="sm" variant="outline" onClick={() => drafts.decideAll(change, "rejected")}>
          <X />
          Reject all
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          disabled={decisions === undefined || pending}
          onClick={submit}
          data-submit={change.id}
        >
          <Send />
          {pending ? "Submitting…" : "Submit decisions"}
          <Kbd className="ml-1">Enter</Kbd>
        </Button>
      </div>

      {error !== undefined && (
        <ErrorNote title="The decisions were not submitted" message={error} />
      )}

      {change.hunks.map((hunk) => (
        <HunkReview
          key={hunk.index}
          change={change}
          hunk={hunk}
          drafts={drafts}
          focused={focusedIndex === hunk.index}
          onFocus={() => onFocusHunk(hunk.index)}
          refs={refs}
        />
      ))}
    </section>
  )
}

function HunkReview({
  change,
  hunk,
  drafts,
  focused,
  onFocus,
  refs,
}: {
  readonly change: ProposedChange
  readonly hunk: Hunk
  readonly drafts: ReviewDrafts
  readonly focused: boolean
  readonly onFocus: () => void
  readonly refs: ReviewRefs
}) {
  const key = hunkKey(change.id, hunk.index)
  const draft = drafts.draftFor(change.id, hunk.index)
  const verdict = (decision: Verdict) => () => {
    onFocus()
    drafts.decide(change.id, hunk.index, decision)
  }

  return (
    <div
      ref={(element) => {
        if (element) refs.hunks.set(key, element)
        else refs.hunks.delete(key)
      }}
      onClick={onFocus}
      className={cn(
        "scroll-mt-4 rounded-lg ring-offset-2 ring-offset-background transition-shadow",
        focused && "ring-2 ring-ring",
      )}
      aria-current={focused ? "true" : undefined}
    >
      <HunkView
        hunk={hunk}
        filePath={change.filePath}
        className={cn(
          draft.decision === "approved" && "border-emerald-500/60",
          draft.decision === "rejected" && "border-red-500/60",
        )}
        actions={
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant={draft.decision === "approved" ? "default" : "ghost"}
              onClick={verdict("approved")}
              aria-pressed={draft.decision === "approved"}
              title="Approve (a)"
            >
              <Check />
              Approve
            </Button>
            <Button
              size="xs"
              variant={draft.decision === "rejected" ? "destructive" : "ghost"}
              onClick={verdict("rejected")}
              aria-pressed={draft.decision === "rejected"}
              title="Reject (r)"
            >
              <X />
              Reject
            </Button>
          </div>
        }
        footer={
          <div className="border-t p-2">
            <Textarea
              ref={(element) => {
                if (element) refs.comments.set(key, element)
                else refs.comments.delete(key)
              }}
              value={draft.comment}
              onChange={(event) =>
                drafts.update(change.id, hunk.index, { comment: event.target.value })
              }
              onFocus={onFocus}
              placeholder={
                draft.decision === "rejected"
                  ? "Tell the agent why (sent with the rejection)…"
                  : "Comment (c)"
              }
              rows={1}
              className="min-h-8 resize-y text-xs"
              aria-label={`Comment on hunk ${hunk.index}`}
            />
          </div>
        }
      />
    </div>
  )
}
