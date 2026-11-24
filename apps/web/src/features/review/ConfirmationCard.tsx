import { useAtomSet } from "@effect/atom-react"
import { type PendingConfirmation, parseMcpToolName } from "@humanity/contracts"
import { Exit } from "effect"
import { memo, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
} from "@/components/ui/code-block"
import { decideConfirmationAtom } from "@/features/session/atoms"
import { JsonBlock } from "@/features/tools/renderers/common"
import { describeCause } from "@/lib/errors"
import { DecisionActions, type Verdict } from "./DecisionActions.tsx"
import { DecisionCard } from "./DecisionCard.tsx"

const asRecord = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {}

function CallPreview({ confirmation }: { readonly confirmation: PendingConfirmation }) {
  const input = asRecord(confirmation.input)
  const command = input["command"]
  if (typeof command === "string") {
    return (
      <div className="flex flex-col gap-1">
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
  if (mcp === undefined) return <span className="font-mono">{name}</span>
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Badge variant="outline" className="h-4 px-1 text-[10px]">
        MCP
      </Badge>
      <span className="truncate font-mono">
        {mcp.server}
        <span className="text-muted-foreground/60"> / </span>
        {mcp.tool}
      </span>
    </span>
  )
}

export const ConfirmationCard = memo(function ConfirmationCard({
  confirmation,
}: {
  readonly confirmation: PendingConfirmation
}) {
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

  const input = asRecord(confirmation.input)
  const description = typeof input["description"] === "string" ? input["description"].trim() : ""

  return (
    <DecisionCard
      label={`The agent wants to run ${confirmation.toolName}`}
      kind={<ToolName name={confirmation.toolName} />}
      title={
        <p className="text-sm font-medium">
          {description !== "" ? description : `Run ${confirmation.toolName}`}
        </p>
      }
      footer={
        <>
          <DecisionActions
            toolName={confirmation.toolName}
            pending={pending}
            onDecide={(verdict) => void submit(verdict)}
          />
          {error !== undefined && <ErrorNote title="The decision was not sent" message={error} />}
        </>
      }
    >
      <div className="px-4 pb-3">
        <CallPreview confirmation={confirmation} />
      </div>
    </DecisionCard>
  )
})
