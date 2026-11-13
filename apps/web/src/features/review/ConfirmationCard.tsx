import { useAtomSet } from "@effect/atom-react"
import { type PendingConfirmation, parseMcpToolName } from "@humanity/contracts"
import { Exit } from "effect"
import { Hand } from "lucide-react"
import { useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
} from "@/components/ui/code-block"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { decideConfirmationAtom } from "@/features/session/atoms"
import { JsonBlock } from "@/features/tools/renderers/common"
import { describeCause } from "@/lib/errors"
import { DecisionActions, type Verdict } from "./DecisionActions.tsx"

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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (verdict: Verdict) => {
    if (pending) return
    setPending(true)
    setError(undefined)
    const exit = await decide({ payload: { confirmationId: confirmation.id, ...verdict } })
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
        <DecisionActions
          toolName={confirmation.toolName}
          pending={pending}
          onDecide={(verdict) => void submit(verdict)}
        />
        {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
      </ItemContent>
    </Item>
  )
}
