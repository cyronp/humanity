import { Schema } from "effect"
import { QUESTION_TOOL } from "./Question.ts"

export const ToolMode = Schema.Literals(["auto", "review", "confirm"])
export type ToolMode = typeof ToolMode.Type

export const HUMANITY_MCP_SERVER = "humanity"

export const OPEN_THREAD_TOOL_NAME = "open_thread"

export const OPEN_THREAD_TOOL = `mcp__${HUMANITY_MCP_SERVER}__${OPEN_THREAD_TOOL_NAME}`

export const AUTO_TOOLS: ReadonlyArray<string> = [
  "Read",
  "Glob",
  "Grep",
  "TodoWrite",
  "Skill",
  OPEN_THREAD_TOOL,
]

export const SHELL_TOOL = "Bash"

export const PATCH_TOOL = "ApplyPatch"

export const MCP_REQUEST_TOOL = "McpRequest"

const EDIT_TOOLS: ReadonlyArray<string> = ["Edit", "Write", "NotebookEdit", PATCH_TOOL]

export const toolMode = (toolName: string): ToolMode =>
  toolName === QUESTION_TOOL
    ? "confirm"
    : AUTO_TOOLS.includes(toolName)
      ? "auto"
      : EDIT_TOOLS.includes(toolName)
        ? "review"
        : "confirm"

export const Autonomy = Schema.Literals(["ask", "accept_edits", "auto"])
export type Autonomy = typeof Autonomy.Type

export const DEFAULT_AUTONOMY: Autonomy = "auto"

export const applyAutonomy = (autonomy: Autonomy, mode: ToolMode): ToolMode => {
  switch (autonomy) {
    case "ask":
      return mode
    case "accept_edits":
      return mode === "review" ? "auto" : mode
    case "auto":
      return "auto"
  }
}

export const parseMcpToolName = (
  toolName: string,
): { readonly server: string; readonly tool: string } | undefined => {
  if (!toolName.startsWith("mcp__")) return undefined
  const rest = toolName.slice("mcp__".length)
  const separator = rest.indexOf("__")
  if (separator <= 0) return undefined
  return { server: rest.slice(0, separator), tool: rest.slice(separator + 2) }
}
