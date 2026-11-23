import type { ApprovalDecision } from "@humanity/contracts"
import { Check, CheckCheck, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface Verdict {
  readonly decision: ApprovalDecision
  readonly comment?: string
  readonly allowForSession?: true
}

export function DecisionActions({
  toolName,
  pending,
  onDecide,
  lineComments = 0,
}: {
  readonly toolName: string
  readonly pending: boolean
  readonly onDecide: (verdict: Verdict) => void
  readonly lineComments?: number
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
        placeholder={
          lineComments === 0
            ? "Optional comment (sent to the agent if you deny)"
            : "Optional comment, sent with your line comments if you deny"
        }
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
          {lineComments === 0
            ? "Deny"
            : `Deny with ${lineComments} comment${lineComments === 1 ? "" : "s"}`}
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
