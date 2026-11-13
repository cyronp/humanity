import type { ApprovalDecision } from "@humanity/contracts"
import { Check, CheckCheck, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** The human's answer to a request, as the decide RPCs take it. */
export interface Verdict {
  readonly decision: ApprovalDecision
  readonly comment?: string
  readonly allowForSession?: true
}

/**
 * The answer to anything the agent waits on, a file change or a tool call
 * alike: deny (with a word for the agent), allow once, or allow this tool for
 * the rest of the thread. The buttons carry `data-decide` so the pending
 * change cards' shortcuts can press them.
 */
export function DecisionActions({
  toolName,
  pending,
  onDecide,
}: {
  readonly toolName: string
  readonly pending: boolean
  readonly onDecide: (verdict: Verdict) => void
}) {
  const [comment, setComment] = useState("")
  const decide = (decision: ApprovalDecision, allowForSession = false) => {
    const text = comment.trim()
    onDecide({
      decision,
      ...(text === "" ? {} : { comment: text }),
      ...(allowForSession ? { allowForSession: true as const } : {}),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment (sent to the agent if you deny)"
        aria-label="Comment for the agent"
        data-decide="comment"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => decide("deny")}
          disabled={pending}
          data-decide="deny"
        >
          <X />
          Deny
        </Button>
        <Button
          variant="outline"
          onClick={() => decide("allow", true)}
          disabled={pending}
          title={`Allow this, and stop asking about ${toolName} in this thread`}
        >
          <CheckCheck />
          Always allow in this thread
        </Button>
        <Button onClick={() => decide("allow")} disabled={pending} data-decide="allow">
          <Check />
          Allow
        </Button>
      </div>
    </div>
  )
}
