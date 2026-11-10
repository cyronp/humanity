import type { Approval, ChatMessage, MessageContent, ToolCall } from "@humanity/contracts"
import { Brain, CircleCheck, Info, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
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
import { Markdown } from "./Markdown.tsx"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

/**
 * The transcript: what the human said, what the agent said and did. Built on
 * shadcn's Message Scroller, which follows the reply while it streams unless
 * the human scrolls up, and offers a button back to the end.
 */
export function MessageList({
  messages,
  toolCalls,
  draft,
  working,
  approvalFor,
  worktreePath,
  empty,
  footer,
}: {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly draft: string
  /** The agent is mid-turn: shows a working line while no text is streaming. */
  readonly working: boolean
  readonly approvalFor: (toolUseId: string) => Approval | undefined
  readonly worktreePath: string
  /** Shown while the transcript is empty. */
  readonly empty?: ReactNode
  /** Shown after the last message, such as the reason the agent stopped. */
  readonly footer?: ReactNode
}) {
  const items = messages.flatMap((message) => {
    const rendered = renderContent(message.content, toolCalls, approvalFor, worktreePath)
    return rendered === null ? [] : [{ message, rendered }]
  })
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent
            aria-label="Conversation"
            aria-busy={draft !== "" || working}
            className="mx-auto w-full max-w-3xl gap-4 p-4"
          >
            {items.length === 0 && draft === "" && empty !== undefined && (
              <MessageScrollerItem messageId="empty">{empty}</MessageScrollerItem>
            )}
            {items.map(({ message, rendered }) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.content._tag === "user"}
              >
                {rendered}
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
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

const renderContent = (
  content: MessageContent,
  toolCalls: Readonly<Record<string, ToolCall>>,
  approvalFor: (toolUseId: string) => Approval | undefined,
  worktreePath: string,
) => {
  switch (content._tag) {
    case "user":
      return <UserMessage text={content.text} />
    case "assistant":
      return (
        <AssistantMessage
          content={content}
          toolCalls={toolCalls}
          approvalFor={approvalFor}
          worktreePath={worktreePath}
        />
      )
    case "result":
      return <TurnFooter content={content} />
    case "system_init":
      return <InitLine content={content} />
    case "notice":
      return <Notice content={content} />
    // Tool results show up inside their tool call card.
    case "tool_results":
    case "other":
      return null
  }
}

function UserMessage({ text }: { readonly text: string }) {
  return (
    <Message align="end">
      <MessageBody>
        <Bubble align="end" className="max-w-[85%]">
          <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
        </Bubble>
      </MessageBody>
    </Message>
  )
}

function AssistantMessage({
  content,
  toolCalls,
  approvalFor,
  worktreePath,
}: {
  readonly content: Content<"assistant">
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly approvalFor: (toolUseId: string) => Approval | undefined
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
                  approval={approvalFor(block.toolUseId)}
                  worktreePath={worktreePath}
                />
              )
          }
        })}
      </MessageBody>
    </Message>
  )
}

/** The agent's thinking, collapsed to one line, as shadcn's Reasoning element does it. */
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
