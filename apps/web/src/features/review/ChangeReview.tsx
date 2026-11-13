import { useAtomSet } from "@effect/atom-react"
import type { ProposedChange } from "@humanity/contracts"
import { countChanges } from "@humanity/diff"
import { Exit } from "effect"
import { FilePlus, FileDiff as FileDiffIcon } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { ChangeCount } from "@/features/diff/FileDiffView"
import { HunkView } from "@/features/diff/HunkView"
import { decideChangeAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { DecisionActions, type Verdict } from "./DecisionActions.tsx"

/**
 * One file change the agent waits on: its diff, and one answer for all of it.
 * The answer sits above the diff, so a long change needs no scrolling to decide.
 */
export function ChangeReview({ change }: { readonly change: ProposedChange }) {
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
    <section
      className="flex scroll-mt-4 flex-col gap-3"
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
      </header>

      <DecisionActions
        toolName={change.toolName}
        pending={pending}
        onDecide={(verdict) => void submit(verdict)}
      />
      {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}

      {change.hunks.map((hunk) => (
        <HunkView key={hunk.index} hunk={hunk} filePath={change.filePath} />
      ))}
    </section>
  )
}
