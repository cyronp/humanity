import {
  type Approval,
  type Attachment,
  type ChatMessage,
  type MessageContent,
  PROVIDER_NAMES,
  type SessionId,
  type ToolCall,
} from "@humanity/contracts"
import {
  ArrowRight,
  Brain,
  Check,
  CircleCheck,
  Copy,
  GitFork,
  History,
  Info,
  TriangleAlert,
  Undo2,
} from "lucide-react"
import { cn } from "cn"
import { memo, type ReactNode, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent as MessageBody, MessageHeader } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller"
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
import { modelDisplayName } from "@/features/providers/models"
import { ProviderIcon } from "@/features/providers/ProviderIcon"
import { useProviderModels } from "@/features/providers/useProviderModels"
import { ToolCallCard } from "@/features/tools/ToolCallCard"
import { useUiPreferences } from "@/lib/uiPreferences"
import { MessageAttachments } from "./attachments.tsx"
import { FileReferenceText } from "./FileReferenceText.tsx"
import { Markdown } from "./Markdown.tsx"
import {
  type TranscriptActions,
  TranscriptActionsContext,
  rewindSummary,
  type TurnEnd,
  turnEnds,
  undoableRewinds,
  useTranscriptActions,
} from "./transcriptActions.ts"
import {
  formatTokens,
  type HandoffWeight,
  handoffTokens,
  handoffWeight,
  providerSwitchDetail,
  providerSwitchStatus,
  providerSwitchSummary,
} from "./providerSwitch.ts"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

const FOCUS_HIGHLIGHT_MS = 2500

const isShown = (message: ChatMessage) =>
  message.content._tag !== "tool_results" && message.content._tag !== "other"

export function MessageList({
  messages,
  toolCalls,
  draft,
  working,
  approvals,
  worktreePath,
  empty,
  earlier,
  footer,
  bottomInset = 0,
  actions,
  focus,
  onFocusMissing,
}: {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly draft: string
  readonly working: boolean
  readonly approvals: ReadonlyMap<string, Approval>
  readonly worktreePath: string
  readonly empty?: ReactNode
  readonly earlier?: ReactNode
  readonly footer?: ReactNode
  readonly bottomInset?: number
  readonly actions?: TranscriptActions | undefined
  readonly focus?: string | undefined
  readonly onFocusMissing?: (() => void) | undefined
}) {
  const items = useMemo(() => messages.filter(isShown), [messages])
  const delivered = useMemo(() => deliveredSwitches(messages), [messages])
  const undoable = useMemo(() => undoableRewinds(messages), [messages])
  const turns = useMemo(() => turnEnds(messages), [messages])
  const provided = useMemo(() => actions ?? {}, [actions])
  const [highlighted, setHighlighted] = useState<string>()
  useEffect(() => {
    if (highlighted === undefined) return
    const timer = setTimeout(() => setHighlighted(undefined), FOCUS_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [highlighted])
  return (
    <TranscriptActionsContext value={provided}>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent
              aria-label="Conversation"
              aria-busy={draft !== "" || working}
              className="mx-auto w-full max-w-3xl gap-4 px-4 pt-16"
              style={{ paddingBottom: bottomInset + 16 }}
            >
              {items.length === 0 && draft === "" && empty !== undefined && (
                <MessageScrollerItem messageId="empty">{empty}</MessageScrollerItem>
              )}
              {earlier !== undefined && (
                <MessageScrollerItem messageId="earlier">{earlier}</MessageScrollerItem>
              )}
              {focus !== undefined && (
                <FocusMessage
                  messageId={focus}
                  present={items.some((message) => message.id === focus)}
                  onMissing={onFocusMissing}
                  onFocused={setHighlighted}
                />
              )}
              {items.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.content._tag === "user"}
                  className={cn(
                    "rounded-lg ring-offset-4 ring-offset-background transition-shadow duration-700",
                    message.id === highlighted && "ring-2 ring-primary/40",
                  )}
                >
                  <TranscriptEntry
                    message={message}
                    delivered={delivered.has(message.id)}
                    undoable={undoable.has(message.id)}
                    turn={turns.get(message.id)}
                    toolCalls={toolCalls}
                    approvals={approvals}
                    worktreePath={worktreePath}
                  />
                </MessageScrollerItem>
              ))}
              {draft !== "" && (
                <MessageScrollerItem messageId="draft">
                  <Message>
                    <MessageBody>
                      <Markdown text={draft} streaming />
                    </MessageBody>
                  </Message>
                </MessageScrollerItem>
              )}
              {draft === "" && working && (
                <MessageScrollerItem messageId="working">
                  <Trace>
                    <TraceLine status="running" className="text-xs">
                      <TraceTitle>Working…</TraceTitle>
                    </TraceLine>
                  </Trace>
                </MessageScrollerItem>
              )}
              {footer !== undefined && (
                <MessageScrollerItem messageId="footer">{footer}</MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton style={{ bottom: bottomInset + 16 }} />
        </MessageScroller>
      </MessageScrollerProvider>
    </TranscriptActionsContext>
  )
}

const deliveredSwitches = (messages: ReadonlyArray<ChatMessage>): ReadonlySet<string> => {
  const delivered = new Set<string>()
  let waiting: Array<string> = []
  for (const message of messages) {
    if (message.content._tag === "provider_switch") waiting.push(message.id)
    if (message.content._tag === "user") {
      for (const id of waiting) delivered.add(id)
      waiting = []
    }
  }
  return delivered
}

const TranscriptEntry = memo(function TranscriptEntry({
  message,
  delivered,
  undoable,
  turn,
  toolCalls,
  approvals,
  worktreePath,
}: {
  readonly message: ChatMessage
  readonly delivered: boolean
  readonly undoable: boolean
  readonly turn: TurnEnd | undefined
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly approvals: ReadonlyMap<string, Approval>
  readonly worktreePath: string
}) {
  return renderContent(
    message,
    message.content,
    toolCalls,
    approvals,
    worktreePath,
    delivered,
    undoable,
    turn,
  )
})

const renderContent = (
  message: ChatMessage,
  content: MessageContent,
  toolCalls: Readonly<Record<string, ToolCall>>,
  approvals: ReadonlyMap<string, Approval>,
  worktreePath: string,
  delivered: boolean,
  undoable: boolean,
  turn: TurnEnd | undefined,
) => {
  switch (content._tag) {
    case "user":
      return (
        <UserMessage
          message={message}
          sessionId={message.sessionId}
          text={content.text}
          attachments={content.attachments ?? []}
          mentions={content.mentions ?? NO_MENTIONS}
        />
      )
    case "assistant":
      return (
        <AssistantMessage
          content={content}
          toolCalls={toolCalls}
          approvals={approvals}
          worktreePath={worktreePath}
        />
      )
    case "result":
      return <TurnFooter content={content} turn={turn} />
    case "system_init":
      return <InitLine content={content} />
    case "notice":
      return <Notice content={content} />
    case "provider_switch":
      return <ProviderSwitchLine content={content} delivered={delivered} />
    case "rewind":
      return <RewindLine messageId={message.id} content={content} undoable={undoable} />
    case "tool_results":
    case "other":
      return null
  }
}

const NO_MENTIONS: ReadonlyArray<string> = []

function UserMessage({
  message,
  sessionId,
  text,
  attachments,
  mentions,
}: {
  readonly message: ChatMessage
  readonly sessionId: SessionId
  readonly text: string
  readonly attachments: ReadonlyArray<Attachment>
  readonly mentions: ReadonlyArray<string>
}) {
  const { onRewind } = useTranscriptActions()
  return (
    <Message align="end" className="group/user">
      <MessageBody>
        {attachments.length > 0 && (
          <MessageAttachments sessionId={sessionId} attachments={attachments} />
        )}
        <div className="flex items-start justify-end gap-1">
          <CopyText text={text} label="Copy message" className={cn("mt-1.5", REVEAL_USER)} />
          {onRewind !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="muted"
                  size="icon-xs"
                  className={cn("mt-1.5", REVEAL_USER)}
                  aria-label="Rewind to before this message"
                  onClick={() => onRewind(message)}
                >
                  <History />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rewind to before this message</TooltipContent>
            </Tooltip>
          )}
          <Bubble align="end" className="max-w-[85%]">
            <BubbleContent className="whitespace-pre-wrap">
              <FileReferenceText text={text} mentions={mentions} />
            </BubbleContent>
          </Bubble>
        </div>
      </MessageBody>
    </Message>
  )
}

const REVEAL_USER =
  "opacity-0 transition-opacity group-focus-within/user:opacity-100 group-hover/user:opacity-100 pointer-coarse:opacity-100"

const REVEAL_TURN =
  "opacity-0 transition-opacity group-focus-within/turn:opacity-100 group-hover/turn:opacity-100 pointer-coarse:opacity-100"

function CopyText({
  text,
  label,
  className,
}: {
  readonly text: string
  readonly label: string
  readonly className?: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="muted"
          size="icon-xs"
          className={className}
          aria-label={copied ? "Copied" : label}
          onClick={copy}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  )
}

function TurnActions({ turn }: { readonly turn: TurnEnd | undefined }) {
  const { onFork } = useTranscriptActions()
  if (turn === undefined) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {turn.reply !== "" && (
        <CopyText text={turn.reply} label="Copy response" className={REVEAL_TURN} />
      )}
      {onFork !== undefined && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="muted"
              size="icon-xs"
              className={REVEAL_TURN}
              aria-label="Fork from here"
              onClick={() => onFork(turn)}
            >
              <GitFork />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fork from here</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function AssistantMessage({
  content,
  toolCalls,
  approvals,
  worktreePath,
}: {
  readonly content: Content<"assistant">
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly approvals: ReadonlyMap<string, Approval>
  readonly worktreePath: string
}) {
  const nested = content.parentToolUseId !== null
  return (
    <Message className={nested ? "ml-4 border-l pl-3 opacity-80" : undefined}>
      <MessageBody className="gap-2">
        {nested && <MessageHeader className="px-0">subagent</MessageHeader>}
        {content.blocks.map((block, position) => {
          switch (block._tag) {
            case "text":
              return <Markdown key={position} text={block.text} />
            case "thinking":
              return block.text === "" ? null : <Thinking key={position} text={block.text} />
            case "tool_use":
              return (
                <ToolCallCard
                  key={block.toolUseId}
                  toolName={block.toolName}
                  input={block.input}
                  call={toolCalls[block.toolUseId]}
                  approval={approvals.get(block.toolUseId)}
                  worktreePath={worktreePath}
                />
              )
          }
        })}
      </MessageBody>
    </Message>
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

const formatDuration = (ms: number) =>
  ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.round(ms / 60_000)} min`

function TurnFooter({
  content,
  turn,
}: {
  readonly content: Content<"result">
  readonly turn: TurnEnd | undefined
}) {
  const details = [
    content.numTurns > 0 ? `${content.numTurns} turn${content.numTurns === 1 ? "" : "s"}` : null,
    content.durationMs > 0 ? formatDuration(content.durationMs) : null,
  ].filter((part) => part !== null)

  if (content.isError) {
    const reason =
      content.subtype === "error_during_execution"
        ? "Stopped before finishing."
        : (content.text ?? content.subtype)
    return (
      <div className="group/turn flex items-center gap-2">
        <Trace className="min-w-0 flex-1">
          <TraceLine status="error" className="text-xs">
            <TraceIcon>
              <TriangleAlert className="size-3.5" />
            </TraceIcon>
            <TraceTitle title={reason}>{reason}</TraceTitle>
            {details.length > 0 && <TraceDescription>{details.join(" · ")}</TraceDescription>}
          </TraceLine>
        </Trace>
        <TurnActions turn={turn} />
      </div>
    )
  }
  return (
    <div className="group/turn flex items-center gap-2 border-t pt-2">
      <Trace className="min-w-0 flex-1">
        <TraceLine className="text-xs">
          <TraceIcon>
            <CircleCheck className="size-3.5" />
          </TraceIcon>
          <TraceTitle>Done</TraceTitle>
          {details.length > 0 && <TraceDescription>{details.join(" · ")}</TraceDescription>}
        </TraceLine>
      </Trace>
      <TurnActions turn={turn} />
    </div>
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

const WEIGHT_CLASS: Record<HandoffWeight, string> = {
  light: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  heavy: "bg-destructive/10 text-destructive",
}

function ProviderSwitchLine({
  content,
  delivered,
}: {
  readonly content: Content<"provider_switch">
  readonly delivered: boolean
}) {
  const { models } = useProviderModels()
  const withAccount = (name: string, account: string | undefined) =>
    account === undefined ? name : `${name} (${account})`
  const names = {
    from: withAccount(
      content.fromModel === undefined
        ? PROVIDER_NAMES[content.from]
        : modelDisplayName(models[content.from], content.fromModel),
      content.fromAccount,
    ),
    to: withAccount(modelDisplayName(models[content.to], content.model), content.account),
  }
  const summary = providerSwitchSummary(content, names, delivered)
  const status = providerSwitchStatus(content, delivered)
  const tokens = handoffTokens(content)
  const icon = "inline-block size-3.5 align-[-0.2em]"
  return (
    <div role="separator" className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span
        className="min-w-0 truncate whitespace-nowrap"
        title={`${summary}
${providerSwitchDetail(content)}`}
        aria-label={summary}
      >
        <ProviderIcon provider={content.from} className={icon} /> {names.from}{" "}
        <ArrowRight className="inline-block size-3 align-[-0.15em]" aria-hidden />{" "}
        <ProviderIcon provider={content.to} className={icon} />{" "}
        <span className="font-medium text-foreground">{names.to}</span>
        {status !== "" && ` · ${status}`}
        {tokens !== undefined && (
          <>
            {" · "}
            <span
              className={cn(
                "inline-block rounded px-1.5 py-0.5 font-medium tabular-nums",
                WEIGHT_CLASS[handoffWeight(tokens)],
              )}
            >
              ~{formatTokens(tokens)} tokens
            </span>
          </>
        )}
      </span>
      <span className="h-px min-w-4 flex-1 bg-border" />
    </div>
  )
}

function Notice({ content }: { readonly content: Content<"notice"> }) {
  return (
    <Alert variant={content.level === "error" ? "destructive" : "default"}>
      <TriangleAlert />
      <AlertDescription>{content.text}</AlertDescription>
    </Alert>
  )
}

function RewindLine({
  messageId,
  content,
  undoable,
}: {
  readonly messageId: string
  readonly content: Content<"rewind">
  readonly undoable: boolean
}) {
  const { onUndoRewind } = useTranscriptActions()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const summary = rewindSummary(content)
  const undo = async () => {
    if (onUndoRewind === undefined) return
    setPending(true)
    setError(undefined)
    setError(await onUndoRewind(messageId))
    setPending(false)
  }
  return (
    <div className="flex flex-col gap-1">
      <div role="separator" className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
        <span className="h-px min-w-4 flex-1 bg-border" />
        <History className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate whitespace-nowrap" title={summary}>
          {summary}
        </span>
        {undoable && onUndoRewind !== undefined && (
          <Button variant="muted" size="xs" disabled={pending} onClick={() => void undo()}>
            {pending ? <Spinner /> : <Undo2 />}
            Undo
          </Button>
        )}
        <span className="h-px min-w-4 flex-1 bg-border" />
      </div>
      {error !== undefined && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  )
}

function FocusMessage({
  messageId,
  present,
  onMissing,
  onFocused,
}: {
  readonly messageId: string
  readonly present: boolean
  readonly onMissing: (() => void) | undefined
  readonly onFocused: (messageId: string) => void
}) {
  const { scrollToMessage } = useMessageScroller()
  const [done, setDone] = useState<string>()
  useEffect(() => {
    if (done === messageId) return
    if (!present) {
      onMissing?.()
      return
    }
    const frame = requestAnimationFrame(() => {
      if (!scrollToMessage(messageId, { behavior: "smooth" })) return
      setDone(messageId)
      onFocused(messageId)
    })
    return () => cancelAnimationFrame(frame)
  }, [done, messageId, onFocused, onMissing, present, scrollToMessage])
  return null
}
