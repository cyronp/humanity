import {
  type Approval,
  type ChatMessage,
  isPendingApproval,
  type MessageContent,
  type ToolCall,
} from "@humanity/contracts"
import { Brain, GitFork, Info, Pencil, Search, SquareTerminal, TriangleAlert } from "lucide-react"
import { memo, type ReactNode, useMemo, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { ToolCallCard } from "@/features/tools/ToolCallCard"
import { useNow } from "@/lib/elapsed"
import { useUiPreferences } from "@/lib/uiPreferences"
import { CopyButton } from "@/components/CopyButton"
import { IconButton } from "@/components/IconButton"
import { Markdown } from "./Markdown.tsx"
import { type TurnEnd, useTranscriptActions } from "./transcriptActions.ts"
import {
  formatWorked,
  isToolStep,
  type Phase,
  phasesOf,
  phaseSummary,
  type Step,
  turnParts,
  workedMs,
} from "./turns.ts"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

interface StepContext {
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly approvals: ReadonlyMap<string, Approval>
  readonly worktreePath: string
  readonly subagents: ReadonlyMap<string, ReadonlyArray<Step>>
  readonly live: boolean
}

export interface AgentTurnProps {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly startedAt: string
  readonly live: boolean
  readonly focused: boolean
  readonly end: TurnEnd | undefined
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly approvals: ReadonlyMap<string, Approval>
  readonly worktreePath: string
}

const sameMessages = (a: ReadonlyArray<ChatMessage>, b: ReadonlyArray<ChatMessage>) =>
  a.length === b.length && a.every((message, index) => message === b[index])

const sameTurn = (a: AgentTurnProps, b: AgentTurnProps) =>
  a.startedAt === b.startedAt &&
  a.live === b.live &&
  a.focused === b.focused &&
  a.toolCalls === b.toolCalls &&
  a.approvals === b.approvals &&
  a.worktreePath === b.worktreePath &&
  a.end?.reply === b.end?.reply &&
  a.end?.nextMessage?.id === b.end?.nextMessage?.id &&
  sameMessages(a.messages, b.messages)

const isPending = (approvals: ReadonlyMap<string, Approval>, steps: ReadonlyArray<Step>) =>
  steps.some((step) => {
    if (!isToolStep(step)) return false
    const approval = approvals.get(step.toolUseId)
    return approval !== undefined && isPendingApproval(approval)
  })

export const AgentTurn = memo(function AgentTurn({
  messages,
  startedAt,
  live,
  focused,
  end,
  toolCalls,
  approvals,
  worktreePath,
}: AgentTurnProps) {
  const [{ expandToolCalls }] = useUiPreferences()
  const parts = useMemo(() => turnParts(messages), [messages])
  const phases = useMemo(() => phasesOf(parts.steps), [parts.steps])
  const pending = useMemo(
    () =>
      isPending(approvals, parts.steps) ||
      [...parts.subagents.values()].some((steps) => isPending(approvals, steps)),
    [approvals, parts],
  )
  const [chosen, setChosen] = useState<boolean>()
  const open = chosen ?? (live || pending || focused || expandToolCalls)
  const context: StepContext = {
    toolCalls,
    approvals,
    worktreePath,
    subagents: parts.subagents,
    live,
  }
  const folded = live || parts.init !== undefined || parts.steps.length > 0
  const tools = parts.steps.filter(isToolStep).length
  const error = parts.result?.isError === true ? parts.result : undefined

  return (
    <div className="group/turn flex min-w-0 flex-col gap-3">
      {folded && (
        <Trace>
          <TraceCollapsible open={open} onOpenChange={setChosen}>
            <div className="flex min-w-0 items-center gap-2">
              <TraceCollapsibleTrigger className="text-xs">
                <TraceLine {...(live ? { status: "running" } : {})} className="text-xs">
                  <TraceTitle>
                    {live ? (
                      <LiveElapsed startedAt={startedAt} />
                    ) : (
                      <WorkedFor ms={workedMs(startedAt, messages, parts.result)} />
                    )}
                  </TraceTitle>
                  {tools > 0 && (
                    <TraceDescription>
                      · {tools} tool call{tools === 1 ? "" : "s"}
                    </TraceDescription>
                  )}
                  {pending && !open && (
                    <span className="shrink-0 animate-pulse font-medium text-warning">
                      waiting for you
                    </span>
                  )}
                </TraceLine>
              </TraceCollapsibleTrigger>
              {error === undefined && <TurnActions turn={end} />}
            </div>
            <TraceCollapsibleContent className="text-xs">
              <div className="flex min-w-0 flex-col gap-2">
                {parts.init !== undefined && <InitLine content={parts.init} />}
                {phases.length === 1 ? (
                  <Steps steps={phases[0]?.steps ?? []} context={context} />
                ) : (
                  phases.map((phase, index) => (
                    <PhaseView key={index} phase={phase} context={context} />
                  ))
                )}
              </div>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      )}
      {parts.reply.map((text, index) => (
        <Markdown key={index} text={text} />
      ))}
      {error !== undefined ? (
        <TurnError content={error} turn={end} />
      ) : (
        !folded && end !== undefined && <TurnActions turn={end} />
      )}
    </div>
  )
}, sameTurn)

function WorkedFor({ ms }: { readonly ms: number | undefined }) {
  return ms === undefined ? "Steps" : `Worked for ${formatWorked(ms)}`
}

function LiveElapsed({ startedAt }: { readonly startedAt: string }) {
  const now = useNow(1000)
  const ms = now - Date.parse(startedAt)
  return Number.isFinite(ms) ? `Working for ${formatWorked(ms)}` : "Working"
}

function Steps({
  steps,
  context,
}: {
  readonly steps: ReadonlyArray<Step>
  readonly context: StepContext
}) {
  return steps.map((step, index) => {
    switch (step._tag) {
      case "text":
        return (
          <div key={index} className="text-foreground/80">
            <Markdown text={step.text} />
          </div>
        )
      case "thinking":
        return <Thinking key={index} text={step.text} />
      case "tool": {
        const nested = context.subagents.get(step.toolUseId)
        return (
          <div key={step.toolUseId} className="flex min-w-0 flex-col gap-2">
            <ToolCallCard
              toolName={step.toolName}
              input={step.input}
              call={context.toolCalls[step.toolUseId]}
              approval={context.approvals.get(step.toolUseId)}
              worktreePath={context.worktreePath}
            />
            {nested !== undefined && nested.length > 0 && (
              <div className="ml-4 flex min-w-0 flex-col gap-2 border-l pl-3 opacity-80">
                <span className="text-xs text-muted-foreground">subagent</span>
                <Steps steps={nested} context={context} />
              </div>
            )}
          </div>
        )
      }
    }
  })
}

const PHASE_ICON: Record<"explore" | "edit" | "run", ReactNode> = {
  explore: <Search className="size-3.5" />,
  edit: <Pencil className="size-3.5" />,
  run: <SquareTerminal className="size-3.5" />,
}

function PhaseView({ phase, context }: { readonly phase: Phase; readonly context: StepContext }) {
  const [{ expandToolCalls }] = useUiPreferences()
  const [chosen, setChosen] = useState<boolean>()
  const tools = phase.steps.filter(isToolStep)
  const calls = tools.map((tool) => context.toolCalls[tool.toolUseId])
  const pending = isPending(context.approvals, phase.steps)
  const running =
    context.live && calls.some((call) => call === undefined || call.status === "running")
  const failed = calls.filter((call) => call?.status === "failed").length
  const denied = calls.filter((call) => call?.status === "denied").length
  const open = chosen ?? (pending || expandToolCalls)

  if (phase.kind === "notes" || phase.kind === "other" || phase.steps.length === 1) {
    return <Steps steps={phase.steps} context={context} />
  }
  const summary = phaseSummary(phase, running && !pending, context.worktreePath)
  return (
    <Trace>
      <TraceCollapsible open={open} onOpenChange={setChosen}>
        <TraceCollapsibleTrigger className="w-full text-xs">
          <TraceLine
            {...(running && !pending ? { status: "running" } : {})}
            className="min-w-0 flex-1 text-xs"
          >
            <TraceIcon>
              {running && !pending ? (
                <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                PHASE_ICON[phase.kind]
              )}
            </TraceIcon>
            <TraceTitle>
              {summary.title}
              {summary.command !== undefined && (
                <code className="ml-1.5 font-mono text-foreground/80">{summary.command}</code>
              )}
            </TraceTitle>
            {summary.detail !== undefined && summary.detail !== "" && (
              <TraceDescription>· {summary.detail}</TraceDescription>
            )}
            {failed > 0 && <span className="shrink-0 text-destructive">· {failed} failed</span>}
            {denied > 0 && <span className="shrink-0 text-warning">· {denied} denied</span>}
            {pending && (
              <span className="shrink-0 animate-pulse font-medium text-warning">
                waiting for you
              </span>
            )}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-xs">
          <div className="flex min-w-0 flex-col gap-2">
            <Steps steps={phase.steps} context={context} />
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

function Thinking({ text }: { readonly text: string }) {
  const [{ expandThinking }] = useUiPreferences()
  return (
    <Trace>
      <TraceCollapsible defaultOpen={expandThinking}>
        <TraceCollapsibleTrigger className="text-xs">
          <TraceLine className="text-xs">
            <TraceIcon>
              <Brain className="size-3.5" />
            </TraceIcon>
            <TraceTitle>Thought</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-xs whitespace-pre-wrap">
          {text}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

function InitLine({ content }: { readonly content: Content<"system_init"> }) {
  const parts = [
    content.model,
    `${content.tools.length} tools`,
    content.skills.length > 0 ? `skills: ${content.skills.join(", ")}` : null,
    content.mcpServers.length > 0
      ? `MCP: ${content.mcpServers.map((server) => `${server.name} (${server.status})`).join(", ")}`
      : null,
  ].filter((part) => part !== null)
  const summary = `Agent started · ${parts.join(" · ")}`
  return (
    <Trace>
      <TraceLine className="text-xs">
        <TraceIcon>
          <Info className="size-3.5" />
        </TraceIcon>
        <TraceTitle title={summary}>{summary}</TraceTitle>
      </TraceLine>
    </Trace>
  )
}

function TurnError({
  content,
  turn,
}: {
  readonly content: Content<"result">
  readonly turn: TurnEnd | undefined
}) {
  const reason =
    content.subtype === "error_during_execution"
      ? "Stopped before finishing."
      : (content.text ?? content.subtype)
  return (
    <div className="flex items-center gap-2">
      <Trace className="min-w-0 flex-1">
        <TraceLine status="error" className="text-xs">
          <TraceIcon>
            <TriangleAlert className="size-3.5" />
          </TraceIcon>
          <TraceTitle title={reason}>{reason}</TraceTitle>
        </TraceLine>
      </Trace>
      <TurnActions turn={turn} />
    </div>
  )
}

export const REVEAL_TURN =
  "opacity-0 transition-opacity group-focus-within/turn:opacity-100 group-hover/turn:opacity-100 pointer-coarse:opacity-100"

function TurnActions({ turn }: { readonly turn: TurnEnd | undefined }) {
  const { onFork } = useTranscriptActions()
  if (turn === undefined) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {turn.reply !== "" && (
        <CopyButton text={turn.reply} label="Copy response" className={REVEAL_TURN} />
      )}
      {onFork !== undefined && (
        <IconButton
          variant="muted"
          size="icon-xs"
          className={REVEAL_TURN}
          label="Fork from here"
          onClick={() => onFork(turn)}
        >
          <GitFork />
        </IconButton>
      )}
    </div>
  )
}
