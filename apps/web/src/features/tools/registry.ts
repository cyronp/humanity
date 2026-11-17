import type { Approval, ToolCall } from "@humanity/contracts"
import type { FC } from "react"

export interface ToolCallProps {
  readonly toolName: string
  readonly input: unknown
  readonly call: ToolCall | undefined
  readonly approval: Approval | undefined
  readonly worktreePath: string | undefined
}

export interface ToolRenderer {
  readonly name: string
  readonly match: (toolName: string, input: unknown) => boolean
  readonly Summary: FC<ToolCallProps>
  readonly Detail: FC<ToolCallProps>
}

export const findRenderer = (
  renderers: ReadonlyArray<ToolRenderer>,
  toolName: string,
  input: unknown,
): ToolRenderer => {
  const found = renderers.find((renderer) => renderer.match(toolName, input))
  if (found === undefined) throw new Error("The renderer registry needs a catch-all renderer.")
  return found
}
