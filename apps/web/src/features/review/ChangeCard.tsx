import { useAtomSet } from "@effect/atom-react"
import type { ProposedChange } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { cn } from "cn"
import { Exit } from "effect"
import { FilePlus, FileDiff as FileDiffIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { fileNameClass, FileStatusLetter } from "@/features/diff/FileStatus"
import { HunkView, type LineComments } from "@/features/diff/HunkView"
import {
  formatReviewComments,
  pendingChangeKey,
  reviewComments,
  useReviewComments,
} from "@/features/diff/reviewComments"
import { decideChangeAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { DecisionActions, type Verdict } from "./DecisionActions.tsx"

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

  return (
    <Item
      variant="attention"
      className="scroll-mt-4 items-start"
      role="alertdialog"
      aria-label={`The agent wants to change ${change.filePath}`}
      data-change-id={change.id}
    >
      <ItemMedia variant="icon">
        {change.kind === "create" ? (
          <FilePlus className="text-warning" />
        ) : (
          <FileDiffIcon className="text-warning" />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 gap-3">
        <ItemTitle className="line-clamp-none flex-wrap">
          The agent wants to {change.kind === "create" ? "create" : "change"}
          <code className={cn("font-mono text-sm break-all", fileNameClass(change.kind))}>
            {change.filePath}
          </code>
          <FileStatusLetter kind={change.kind} />
          <Badge variant="outline">{change.toolName}</Badge>
          <ChangeCount {...countChanges(change.hunks)} />
        </ItemTitle>
        <DecisionActions
          toolName={change.toolName}
          pending={pending}
          onDecide={(verdict) => void submit(verdict)}
          lineComments={comments.length}
        />
        {comments.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Your line comments go to the agent if you deny. If you allow, they wait in Source
            control, under Changes, to add to a message.
          </p>
        )}
        {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto scrollbar-thin">
          {change.hunks.map((hunk) => (
            <HunkView
              key={hunk.index}
              hunk={hunk}
              filePath={change.filePath}
              comments={lineComments}
            />
          ))}
        </div>
      </ItemContent>
    </Item>
  )
}
