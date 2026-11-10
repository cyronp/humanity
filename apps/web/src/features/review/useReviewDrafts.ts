import type { HunkDecisionInput, ProposedChange } from "@humanity/contracts"
import { useCallback, useState } from "react"

export type Verdict = "approved" | "rejected"

export interface HunkDraft {
  readonly decision?: Verdict
  readonly comment: string
}

type Drafts = Readonly<Record<string, Readonly<Record<number, HunkDraft>>>>

const empty: HunkDraft = { comment: "" }

/**
 * The human's in-progress verdicts, kept in the browser until submitted.
 * Nothing reaches the agent until a whole change is submitted at once.
 */
export const useReviewDrafts = () => {
  const [drafts, setDrafts] = useState<Drafts>({})

  const draftFor = useCallback(
    (changeId: string, index: number): HunkDraft => drafts[changeId]?.[index] ?? empty,
    [drafts],
  )

  const update = useCallback(
    (changeId: string, index: number, patch: Partial<HunkDraft>) =>
      setDrafts((current) => ({
        ...current,
        [changeId]: {
          ...current[changeId],
          [index]: { ...(current[changeId]?.[index] ?? empty), ...patch },
        },
      })),
    [],
  )

  /** Toggles a verdict: pressing the same one twice clears it. */
  const decide = useCallback(
    (changeId: string, index: number, decision: Verdict) =>
      setDrafts((current) => {
        const previous = current[changeId]?.[index] ?? empty
        const next: HunkDraft =
          previous.decision === decision ? { comment: previous.comment } : { ...previous, decision }
        return { ...current, [changeId]: { ...current[changeId], [index]: next } }
      }),
    [],
  )

  const decideAll = useCallback(
    (change: ProposedChange, decision: Verdict) =>
      setDrafts((current) => ({
        ...current,
        [change.id]: Object.fromEntries(
          change.hunks.map((hunk) => [
            hunk.index,
            { ...(current[change.id]?.[hunk.index] ?? empty), decision },
          ]),
        ),
      })),
    [],
  )

  const clear = useCallback(
    (changeId: string) =>
      setDrafts((current) => {
        const { [changeId]: _removed, ...rest } = current
        return rest
      }),
    [],
  )

  /** The payload for `decideChange`, or `undefined` while a hunk is undecided. */
  const decisionsFor = useCallback(
    (change: ProposedChange): Array<HunkDecisionInput> | undefined => {
      const result: Array<HunkDecisionInput> = []
      for (const hunk of change.hunks) {
        const draft = drafts[change.id]?.[hunk.index]
        if (draft?.decision === undefined) return undefined
        const comment = draft.comment.trim()
        result.push({
          index: hunk.index,
          decision: draft.decision,
          ...(comment === "" ? {} : { comment }),
        })
      }
      return result
    },
    [drafts],
  )

  return { draftFor, update, decide, decideAll, clear, decisionsFor }
}

export type ReviewDrafts = ReturnType<typeof useReviewDrafts>
