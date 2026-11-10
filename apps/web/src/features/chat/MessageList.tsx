import type { Approval, ChatMessage, MessageContent, ToolCall } from "@humanity/contracts"
import { Brain, Info, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ToolCallCard } from "@/features/tools/ToolCallCard"
import { Markdown } from "./Markdown.tsx"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

/** The transcript: what the human said, what the agent said and did. */
export function MessageList({
  messages,
  toolCalls,
  draft,
  approvalFor,
  worktreePath,
}: {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly draft: string
  readonly approvalFor: (toolUseId: string) => Approval | undefined
  readonly worktreePath: string
}) {
  return (
    <ol className="flex flex-col gap-4" aria-label="Conversation">
      {messages.map((message) => {
        const rendered = renderContent(message.content, toolCalls, approvalFor, worktreePath)
        return rendered === null ? null : <li key={message.id}>{rendered}</li>
      })}
      {draft !== "" && (
        <li aria-live="polite">
          <Markdown text={draft} streaming />
        </li>
      )}
    </ol>
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
    <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
      {text}
    </div>
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
    <div
      className={
        nested ? "ml-4 flex flex-col gap-2 border-l pl-3 opacity-80" : "flex flex-col gap-2"
      }
    >
      {nested && <span className="text-xs text-muted-foreground">subagent</span>}
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
    </div>
  )
}

function Thinking({ text }: { readonly text: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <Brain className="size-3.5" />
        Thinking
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 border-l pl-3 text-xs whitespace-pre-wrap text-muted-foreground">
        {text}
      </CollapsibleContent>
    </Collapsible>
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
    content.costUsd > 0 ? `$${content.costUsd.toFixed(4)}` : null,
  ].filter((part) => part !== null)

  if (content.isError) {
    const reason =
      content.subtype === "error_during_execution"
        ? "Stopped before finishing."
        : (content.text ?? content.subtype)
    return (
      <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <TriangleAlert className="size-3.5" />
        {reason}
        {details.length > 0 && (
          <span className="text-muted-foreground">· {details.join(" · ")}</span>
        )}
      </p>
    )
  }
  return (
    <p className="border-t pt-2 text-xs text-muted-foreground">
      Done{details.length > 0 && ` · ${details.join(" · ")}`}
    </p>
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
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="size-3.5" />
      Agent started · {parts.join(" · ")}
    </p>
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
