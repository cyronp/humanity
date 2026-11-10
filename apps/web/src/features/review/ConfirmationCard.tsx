import { useAtomSet } from "@effect/atom-react"
import { type PendingConfirmation, parseMcpToolName } from "@humanity/contracts"
import { Exit } from "effect"
import { Check, Hand, X } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { decideConfirmationAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"

const asRecord = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {}

/** What the call would do, in the most readable form available for its tool. */
function CallPreview({ confirmation }: { readonly confirmation: PendingConfirmation }) {
  const input = asRecord(confirmation.input)
  const command = input["command"]
  if (typeof command === "string") {
    const description = input["description"]
    return (
      <div className="flex flex-col gap-1">
        {typeof description === "string" && description !== "" && (
          <p className="text-sm">{description}</p>
        )}
        <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
          <span className="text-muted-foreground select-none">$ </span>
          {command}
        </pre>
      </div>
    )
  }
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
      {JSON.stringify(confirmation.input, null, 2)}
    </pre>
  )
}

function ToolName({ name }: { readonly name: string }) {
  const mcp = parseMcpToolName(name)
  if (mcp === undefined) return <Badge className="font-mono">{name}</Badge>
  return (
    <span className="flex items-center gap-1">
      <Badge variant="outline">MCP</Badge>
      <Badge variant="secondary" className="font-mono">
        {mcp.server}
      </Badge>
      <Badge className="font-mono">{mcp.tool}</Badge>
    </span>
  )
}

/** A tool call waiting for an allow or deny, pinned above the message box until decided. */
export function ConfirmationCard({ confirmation }: { readonly confirmation: PendingConfirmation }) {
  const decide = useAtomSet(decideConfirmationAtom, { mode: "promiseExit" })
  const [comment, setComment] = useState("")
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (decision: "allow" | "deny") => {
    if (pending) return
    setPending(true)
    setError(undefined)
    const exit = await decide({
      payload: {
        confirmationId: confirmation.id,
        decision,
        ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
        ...(decision === "allow" && alwaysAllow ? { alwaysAllow: true } : {}),
      },
    })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border-2 border-amber-500 bg-amber-500/5 p-3"
      role="alertdialog"
      aria-label={`The agent wants to run ${confirmation.toolName}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Hand className="size-4 text-amber-600" />
        The agent wants to run
        <ToolName name={confirmation.toolName} />
      </div>
      <CallPreview confirmation={confirmation} />
      <Input
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment (sent to the agent if you deny)"
        aria-label="Comment for the agent"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            id={`always-${confirmation.id}`}
            type="checkbox"
            checked={alwaysAllow}
            onChange={(event) => setAlwaysAllow(event.target.checked)}
            className="size-4"
          />
          <Label htmlFor={`always-${confirmation.id}`} className="text-xs font-normal">
            Always allow {confirmation.toolName} in this project
          </Label>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => submit("deny")} disabled={pending}>
            <X />
            Deny
          </Button>
          <Button onClick={() => submit("allow")} disabled={pending}>
            <Check />
            Allow
          </Button>
        </div>
      </div>
      {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
    </div>
  )
}
