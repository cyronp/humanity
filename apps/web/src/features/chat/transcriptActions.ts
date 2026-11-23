import type { ChatMessage, MessageContent } from "@humanity/contracts"
import { createContext, useContext } from "react"

export interface TranscriptActions {
  readonly onRewind?: ((message: ChatMessage) => void) | undefined
  readonly onFork?: ((message: ChatMessage) => void) | undefined
  readonly onUndoRewind?: ((messageId: string) => Promise<string | undefined>) | undefined
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
