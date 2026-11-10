import { useAtomSet } from "@effect/atom-react"
import { type PendingConfirmation, parseMcpToolName } from "@humanity/contracts"
import { Exit } from "effect"
import { Check, Hand, X } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
} from "@/components/ui/code-block"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { decideConfirmationAtom } from "@/features/session/atoms"
import { JsonBlock } from "@/features/tools/renderers/common"
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
        <CodeBlock size="sm" className="bg-muted">
          <CodeBlockActions>
            <CodeBlockCopyButton value={command} />
          </CodeBlockActions>
          <CodeBlockContent wrap className="break-all">
            <span>
              <span className="text-muted-foreground select-none">$ </span>
              {command}
            </span>
          </CodeBlockContent>
        </CodeBlock>
      </div>
    )
  }
  return <JsonBlock value={confirmation.input} className="max-h-48" />
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
    <Item
      variant="outline"
      className="items-start border-2 border-amber-500 bg-amber-500/5"
      role="alertdialog"
      aria-label={`The agent wants to run ${confirmation.toolName}`}
    >
      <ItemMedia variant="icon">
        <Hand className="text-amber-600" />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-3">
        <ItemTitle className="line-clamp-none flex-wrap">
          The agent wants to run
          <ToolName name={confirmation.toolName} />
        </ItemTitle>
        <CallPreview confirmation={confirmation} />
        <Input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Optional comment (sent to the agent if you deny)"
          aria-label="Comment for the agent"
        />
        {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
      </ItemContent>
      <ItemFooter className="flex-wrap gap-3">
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
        <ItemActions className="ml-auto">
          <Button variant="outline" onClick={() => submit("deny")} disabled={pending}>
            <X />
            Deny
          </Button>
          <Button onClick={() => submit("allow")} disabled={pending}>
            <Check />
            Allow
          </Button>
        </ItemActions>
      </ItemFooter>
    </Item>
  )
}
