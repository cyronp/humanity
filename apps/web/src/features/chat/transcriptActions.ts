import type { ChatMessage, MessageContent } from "@humanity/contracts"
import { createContext, useContext } from "react"

export interface TranscriptActions {
  readonly onRewind?: ((message: ChatMessage) => void) | undefined
  readonly onFork?: ((turn: TurnEnd) => void) | undefined
  readonly onUndoRewind?: ((messageId: string) => Promise<string | undefined>) | undefined
}

export interface TurnEnd {
  readonly reply: string
  readonly nextMessage: ChatMessage | undefined
}

export const turnEnds = (messages: ReadonlyArray<ChatMessage>): ReadonlyMap<string, TurnEnd> => {
  const ends = new Map<string, TurnEnd>()
  let reply: Array<string> = []
  let waiting: Array<{ readonly id: string; readonly reply: string }> = []
  const settle = (nextMessage: ChatMessage | undefined) => {
    for (const end of waiting) ends.set(end.id, { reply: end.reply, nextMessage })
    waiting = []
  }
  for (const message of messages) {
    const content = message.content
    if (content._tag === "user") {
      settle(message)
      reply = []
    } else if (content._tag === "assistant" && content.parentToolUseId === null) {
      for (const block of content.blocks) {
        if (block._tag === "tool_use") reply = []
        if (block._tag === "text" && block.text.trim() !== "") reply.push(block.text)
      }
    } else if (content._tag === "result") {
      waiting.push({ id: message.id, reply: reply.join("\n\n") })
      reply = []
    }
  }
  settle(undefined)
  return ends
}

const NO_ACTIONS: TranscriptActions = {}

export const TranscriptActionsContext = createContext<TranscriptActions>(NO_ACTIONS)

export const useTranscriptActions = (): TranscriptActions => useContext(TranscriptActionsContext)

export const undoableRewinds = (messages: ReadonlyArray<ChatMessage>): ReadonlySet<string> => {
  const undoable = new Set<string>()
  for (const message of messages) {
    if (message.content._tag === "user") undoable.clear()
    if (message.content._tag === "rewind" && message.content.undo === "available") {
      undoable.add(message.id)
    }
  }
  return undoable
}

export const rewindSummary = (content: Extract<MessageContent, { _tag: "rewind" }>): string => {
  const files =
    content.restored === 0
      ? null
      : `${content.restored} file${content.restored === 1 ? "" : "s"} restored`
  const what = content.conversation ? "Rewound to before" : "Restored the files from before"
  return [`${what} “${content.message}”`, files, content.undo === "done" ? "undone" : null]
    .filter((part) => part !== null)
    .join(" · ")
}
