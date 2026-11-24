import type { ApprovalDecision } from "@humanity/contracts"
import { Check, CheckCheck, ChevronDown, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"

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
  shortcuts = false,
}: {
  readonly toolName: string
  readonly pending: boolean
  readonly onDecide: (verdict: Verdict) => void
  readonly lineComments?: number
  readonly shortcuts?: boolean
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
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={
          lineComments === 0
            ? "Tell the agent why, if you deny"
            : `A note to go with your ${lineComments === 1 ? "line comment" : `${lineComments} line comments`}`
        }
        aria-label="Comment for the agent, sent if you deny"
        data-decide="comment"
        className="h-8 min-w-48 flex-1 bg-background text-sm"
      />
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => decide("deny")}
          disabled={pending}
          data-decide="deny"
        >
          <X />
          {lineComments === 0
            ? "Deny"
            : `Deny with ${lineComments} comment${lineComments === 1 ? "" : "s"}`}
          {shortcuts && <Kbd className="ml-0.5 h-4 min-w-4 bg-muted/60 text-[10px]">D</Kbd>}
        </Button>
        <div className="flex items-center">
          <Button
            size="sm"
            onClick={() => decide("allow")}
            disabled={pending}
            data-decide="allow"
            className="rounded-r-none"
          >
            <Check />
            Allow
            {shortcuts && (
              <Kbd className="ml-0.5 h-4 min-w-4 bg-primary-foreground/15 text-[10px] text-primary-foreground/80">
                A
              </Kbd>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                disabled={pending}
                aria-label="More ways to allow"
                className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-64">
              <DropdownMenuItem
                onSelect={() => decide("allow", true)}
                className="items-start gap-2.5 px-2.5 py-2"
              >
                <CheckCheck className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Always allow in this thread</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    Stop asking about <span className="font-mono">{toolName}</span> until it ends
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
