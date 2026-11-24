import { checksMessage } from "@humanity/contracts"
import { cn } from "cn"
import { CircleAlert, CircleCheck, LoaderCircle, SquareTerminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showTerminal } from "@/features/terminal/showTerminal"
import { checksSummary, setChecksState, useChecksState } from "./checks.ts"

export function ChecksBar({
  sessionId,
  onInsert,
}: {
  readonly sessionId: string
  readonly onInsert?: ((text: string) => void) | undefined
}) {
  const state = useChecksState(sessionId)
  if (state === undefined) return null
  const result = state._tag === "done" ? state.result : undefined
  const failed = state._tag === "error" || result?.outcome === "failed"
  const Icon =
    state._tag === "running"
      ? LoaderCircle
      : result?.outcome === "passed"
        ? CircleCheck
        : CircleAlert
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm"
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          state._tag === "running" && "animate-spin text-muted-foreground",
          result?.outcome === "passed" && "text-success",
          failed && "text-destructive",
          (result?.outcome === "timeout" || result?.outcome === "untracked") && "text-warning",
        )}
      />
      <span className="min-w-0 flex-1">{checksSummary(state)}</span>
      {result !== undefined && (
        <Button variant="ghost" size="xs" onClick={() => showTerminal(result.terminalId)}>
          <SquareTerminal />
          Terminal
        </Button>
      )}
      {result?.outcome === "failed" && onInsert !== undefined && (
        <Button
          size="xs"
          title="Put the failing output in your message, to edit and send"
          onClick={() => {
            onInsert(checksMessage(result))
            setChecksState(sessionId, undefined)
          }}
        >
          Add to my message
        </Button>
      )}
      {state._tag !== "running" && (
        <Button variant="ghost" size="xs" onClick={() => setChecksState(sessionId, undefined)}>
          Dismiss
        </Button>
      )}
    </div>
  )
}
