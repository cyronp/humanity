import type {
  Approval,
  Attachment,
  ChatMessage,
  MessageContent,
  SessionId,
  ToolCall,
} from "@humanity/contracts"
import { Brain, CircleCheck, Info, TriangleAlert } from "lucide-react"
import { memo, type ReactNode, useMemo } from "react"
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
import { ToolCallCard } from "@/features/tools/ToolCallCard"
import { MessageAttachments } from "./attachments.tsx"
import { FileReferenceText } from "./FileReferenceText.tsx"
import { Markdown } from "./Markdown.tsx"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

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
}) {
  const items = useMemo(() => messages.filter(isShown), [messages])
  return (
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
            {items.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.content._tag === "user"}
              >
                <TranscriptEntry
                  message={message}
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
  )
}

const TranscriptEntry = memo(function TranscriptEntry({
  message,
  toolCalls,
  approvals,
  worktreePath,
}: {
  readonly message: ChatMessage
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly approvals: ReadonlyMap<string, Approval>
  readonly worktreePath: string
}) {
  return renderContent(message.sessionId, message.content, toolCalls, approvals, worktreePath)
})

const renderContent = (
  sessionId: SessionId,
  content: MessageContent,
  toolCalls: Readonly<Record<string, ToolCall>>,
  approvals: ReadonlyMap<string, Approval>,
  worktreePath: string,
) => {
  switch (content._tag) {
    case "user":
      return (
        <UserMessage
          sessionId={sessionId}
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
      return <TurnFooter content={content} />
    case "system_init":
      return <InitLine content={content} />
    case "notice":
      return <Notice content={content} />
    case "tool_results":
    case "other":
      return null
  }
}

const NO_MENTIONS: ReadonlyArray<string> = []

function UserMessage({
  sessionId,
  text,
  attachments,
  mentions,
}: {
  readonly sessionId: SessionId
  readonly text: string
  readonly attachments: ReadonlyArray<Attachment>
  readonly mentions: ReadonlyArray<string>
}) {
  return (
    <Message align="end">
      <MessageBody>
        {attachments.length > 0 && (
          <MessageAttachments sessionId={sessionId} attachments={attachments} />
        )}
        <Bubble align="end" className="max-w-[85%]">
          <BubbleContent className="whitespace-pre-wrap">
            <FileReferenceText text={text} mentions={mentions} />
          </BubbleContent>
        </Bubble>
      </MessageBody>
    </Message>
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
  return (
    <Trace>
      <TraceCollapsible>
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

function TurnFooter({ content }: { readonly content: Content<"result"> }) {
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
      <Trace>
        <TraceLine status="error" className="text-xs">
          <TraceIcon>
            <TriangleAlert className="size-3.5" />
          </TraceIcon>
          <TraceTitle title={reason}>{reason}</TraceTitle>
          {details.length > 0 && <TraceDescription>{details.join(" · ")}</TraceDescription>}
        </TraceLine>
      </Trace>
    )
  }
  return (
    <Trace className="border-t pt-2">
      <TraceLine className="text-xs">
        <TraceIcon>
          <CircleCheck className="size-3.5" />
        </TraceIcon>
        <TraceTitle>Done</TraceTitle>
        {details.length > 0 && <TraceDescription>{details.join(" · ")}</TraceDescription>}
      </TraceLine>
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

function Notice({ content }: { readonly content: Content<"notice"> }) {
  return (
    <Alert variant={content.level === "error" ? "destructive" : "default"}>
      <TriangleAlert />
      <AlertDescription>{content.text}</AlertDescription>
    </Alert>
  )
}
