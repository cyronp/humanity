import { useAtomSet } from "@effect/atom-react"
import type { ProposedChange } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { cn } from "cn"
import { Exit } from "effect"
import { FilePlus, FileDiff as FileDiffIcon } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { fileNameClass, FileStatusLetter } from "@/features/diff/FileStatus"
import { HunkView } from "@/features/diff/HunkView"
import { decideChangeAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { DecisionActions, type Verdict } from "./DecisionActions.tsx"

/**
 * A file change the agent waits on, pinned above the message box until
 * decided: its diff, and one answer for all of it. The answer sits above the
 * diff, so a long change needs no scrolling to decide.
 */
export function ChangeCard({ change }: { readonly change: ProposedChange }) {
  const decide = useAtomSet(decideChangeAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (verdict: Verdict) => {
    if (pending) return
    setPending(true)
    setError(undefined)
    const exit = await decide({ payload: { changeId: change.id, ...verdict } })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <Item
      variant="outline"
      className="scroll-mt-4 items-start border-2 border-amber-500 bg-amber-500/5"
      role="alertdialog"
      aria-label={`The agent wants to change ${change.filePath}`}
      data-change-id={change.id}
    >
      <ItemMedia variant="icon">
        {change.kind === "create" ? (
          <FilePlus className="text-amber-600" />
        ) : (
          <FileDiffIcon className="text-amber-600" />
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
        />
        {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto scrollbar-thin">
          {change.hunks.map((hunk) => (
            <HunkView key={hunk.index} hunk={hunk} filePath={change.filePath} />
          ))}
        </div>
      </ItemContent>
    </Item>
  )
}
