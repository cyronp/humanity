import type { Approval, ToolCall } from "@humanity/contracts"
import type { FC } from "react"

export interface ToolCallProps {
  readonly toolName: string
  readonly input: unknown
  /** Status and output, once the call has started. */
  readonly call: ToolCall | undefined
  /** The human's decision on this call, if it needed one. */
  readonly approval: Approval | undefined
  /** The session's worktree, to show paths relative to it. */
  readonly worktreePath: string | undefined
}

export interface ToolRenderer {
  readonly name: string
  readonly match: (toolName: string, input: unknown) => boolean
  /** One line, used in the chat. */
  readonly Summary: FC<ToolCallProps>
  /** The expanded view. */
  readonly Detail: FC<ToolCallProps>
}

/** Tries `renderers` in order; the last one must match everything. */
export const findRenderer = (
  renderers: ReadonlyArray<ToolRenderer>,
  toolName: string,
  input: unknown,
): ToolRenderer => {
  const found = renderers.find((renderer) => renderer.match(toolName, input))
  if (found === undefined) throw new Error("The renderer registry needs a catch-all renderer.")
  return found
}
