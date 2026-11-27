import {
  type Approval,
  type Attachment,
  type ChatMessage,
  type MessageContent,
  PROVIDER_NAMES,
  type SessionId,
  type ToolCall,
} from "@humanity/contracts"
import { ArrowRight, Eye, History, TriangleAlert, Undo2 } from "lucide-react"
import { cn } from "cn"
import { type CSSProperties, memo, type ReactNode, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent as MessageBody } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller"
import { Trace, TraceLine, TraceTitle } from "@/components/ui/trace"
import { modelDisplayName } from "@/features/providers/models"
import { ProviderIcon } from "@/features/providers/ProviderIcon"
import { useProviderModels } from "@/features/providers/useProviderModels"
import { CopyButton } from "@/components/CopyButton"
import { IconButton } from "@/components/IconButton"
import { AgentTurn } from "./AgentTurn.tsx"
import { MessageAttachments } from "./attachments.tsx"
import { FileReferenceText } from "./FileReferenceText.tsx"
import { HandoffDialog } from "./HandoffDialog.tsx"
import { Markdown } from "./Markdown.tsx"
import {
  type TranscriptActions,
  TranscriptActionsContext,
  rewindSummary,
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
import { itemOfMessage, transcriptItems } from "./turns.ts"
import { usePinToEndWhileSettling } from "./usePinToEndWhileSettling.ts"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

const FOCUS_HIGHLIGHT_MS = 2500
const EAGER_ITEMS = 4
const EAGER_STYLE: CSSProperties = { contentVisibility: "visible" }

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
  const items = useMemo(() => transcriptItems(messages), [messages])
  const owners = useMemo(() => itemOfMessage(items), [items])
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
  const last = items.at(-1)
  const liveTurn =
    working &&
    last?._tag === "turn" &&
    !last.messages.some((message) => message.content._tag === "result")
      ? last.id
      : undefined
  const focusedItem = focus === undefined ? undefined : owners.get(focus)
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  usePinToEndWhileSettling(viewport, content, focus === undefined)
  return (
    <TranscriptActionsContext value={provided}>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport ref={setViewport}>
            <MessageScrollerContent
              ref={setContent}
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
                  focus={focus}
                  itemId={focusedItem ?? focus}
                  present={focusedItem !== undefined}
                  onMissing={onFocusMissing}
                  onFocused={setHighlighted}
                />
              )}
              {items.map((item, index) => (
                <MessageScrollerItem
                  key={item.id}
                  messageId={item.id}
                  style={index >= items.length - EAGER_ITEMS ? EAGER_STYLE : undefined}
                  scrollAnchor={item._tag === "message" && item.message.content._tag === "user"}
                  className={cn(
                    "rounded-lg ring-offset-4 ring-offset-background transition-shadow duration-700",
                    item.id === highlighted && "ring-2 ring-primary/40",
                  )}
                >
                  {item._tag === "turn" ? (
                    <AgentTurn
                      messages={item.messages}
                      startedAt={item.startedAt}
                      live={item.id === liveTurn}
                      focused={item.id === focusedItem}
                      end={turnEndOf(item.messages, turns)}
                      toolCalls={toolCalls}
                      approvals={approvals}
                      worktreePath={worktreePath}
                    />
                  ) : (
                    <TranscriptEntry
                      message={item.message}
                      delivered={delivered.has(item.id)}
                      undoable={undoable.has(item.id)}
                    />
                  )}
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
              {draft === "" && working && liveTurn === undefined && (
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

const turnEndOf = (messages: ReadonlyArray<ChatMessage>, ends: ReturnType<typeof turnEnds>) => {
  const result = messages.find((message) => message.content._tag === "result")
  return result === undefined ? undefined : ends.get(result.id)
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
}: {
  readonly message: ChatMessage
  readonly delivered: boolean
  readonly undoable: boolean
}) {
  const content = message.content
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
    case "notice":
      return <Notice content={content} />
    case "provider_switch":
      return (
        <ProviderSwitchLine sessionId={message.sessionId} content={content} delivered={delivered} />
      )
    case "rewind":
      return <RewindLine messageId={message.id} content={content} undoable={undoable} />
    default:
      return null
  }
})

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
          <CopyButton text={text} label="Copy message" className={cn("mt-1.5", REVEAL_USER)} />
          {onRewind !== undefined && (
            <IconButton
              variant="muted"
              size="icon-xs"
              className={cn("mt-1.5", REVEAL_USER)}
              label="Rewind to before this message"
              onClick={() => onRewind(message)}
            >
              <History />
            </IconButton>
          )}
          <Bubble variant="muted" align="end" className="max-w-[85%]">
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

const WEIGHT_CLASS: Record<HandoffWeight, string> = {
  light: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  heavy: "bg-destructive/10 text-destructive",
}

function ProviderSwitchLine({
  sessionId,
  content,
  delivered,
}: {
  readonly sessionId: SessionId
  readonly content: Content<"provider_switch">
  readonly delivered: boolean
}) {
  const { models } = useProviderModels()
  const [previewing, setPreviewing] = useState(false)
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
      {!delivered && content.included + (content.cut ?? 0) > 0 && (
        <Button variant="muted" size="xs" onClick={() => setPreviewing(true)}>
          <Eye />
          Preview
        </Button>
      )}
      <span className="h-px min-w-4 flex-1 bg-border" />
      {!delivered && previewing && (
        <HandoffDialog
          sessionId={sessionId}
          target={names.to}
          open={previewing}
          onClose={() => setPreviewing(false)}
        />
      )}
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
  focus,
  itemId,
  present,
  onMissing,
  onFocused,
}: {
  readonly focus: string
  readonly itemId: string
  readonly present: boolean
  readonly onMissing: (() => void) | undefined
  readonly onFocused: (itemId: string) => void
}) {
  const { scrollToMessage } = useMessageScroller()
  const [done, setDone] = useState<string>()
  useEffect(() => {
    if (done === focus) return
    if (!present) {
      onMissing?.()
      return
    }
    const frame = requestAnimationFrame(() => {
      if (!scrollToMessage(itemId, { behavior: "smooth" })) return
      setDone(focus)
      onFocused(itemId)
    })
    return () => cancelAnimationFrame(frame)
  }, [done, focus, itemId, onFocused, onMissing, present, scrollToMessage])
  return null
}
