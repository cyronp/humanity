import { Schema } from "effect"
import { QUESTION_TOOL } from "./Question.ts"

/**
 * What a tool call is, to a thread that asks before it acts:
 *
 * - `auto`: runs without asking in every thread (reads, the agent's own bookkeeping).
 * - `review`: a file change, shown as a diff and approved or declined as a whole.
 * - `confirm`: anything else with side effects, shown as the call and allowed or denied.
 */
export const ToolMode = Schema.Literals(["auto", "review", "confirm"])
export type ToolMode = typeof ToolMode.Type

/** Humanity's own MCP server, running inside the daemon: the tools the app itself gives the agent. */
export const HUMANITY_MCP_SERVER = "humanity"

/** The server's tool that opens a new thread, by the short name the server registers. */
export const OPEN_THREAD_TOOL_NAME = "open_thread"

/** The same tool as the agent calls it. */
export const OPEN_THREAD_TOOL = `mcp__${HUMANITY_MCP_SERVER}__${OPEN_THREAD_TOOL_NAME}`

/**
 * Tools no thread asks about: read-only built-ins, the agent's own bookkeeping,
 * and opening a thread (the new thread follows its own permissions).
 */
export const AUTO_TOOLS: ReadonlyArray<string> = [
  "Read",
  "Glob",
  "Grep",
  "TodoWrite",
  "Skill",
  OPEN_THREAD_TOOL,
]

/** File-mutating built-ins. */
const EDIT_TOOLS: ReadonlyArray<string> = ["Edit", "Write", "NotebookEdit"]

/**
 * What a tool is. The same for every project; how much of it a thread asks
 * about is the thread's `Autonomy`. A tool Humanity does not know is never
 * `auto`. A question for the human is always something to answer.
 */
export const toolMode = (toolName: string): ToolMode =>
  toolName === QUESTION_TOOL
    ? "confirm"
    : AUTO_TOOLS.includes(toolName)
      ? "auto"
      : EDIT_TOOLS.includes(toolName)
        ? "review"
        : "confirm"

/**
 * How much a thread's agent does without the human. Humanity's own presets,
 * not the SDK's permission modes: every call still reaches Humanity's
 * permission check.
 *
 * - `ask`: file changes and other tools with side effects wait for the human.
 * - `accept_edits`: file changes inside the thread's folder are applied without asking.
 * - `auto`: nothing waits, except a question the agent asks the human.
 */
export const Autonomy = Schema.Literals(["ask", "accept_edits", "auto"])
export type Autonomy = typeof Autonomy.Type

/** What a new thread runs with when neither the project nor the human set a default. */
export const DEFAULT_AUTONOMY: Autonomy = "auto"

/** The mode a call gets once the thread's autonomy is applied to what the tool is. */
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

/** Splits `mcp__<server>__<tool>` into its parts. */
export const parseMcpToolName = (
  toolName: string,
): { readonly server: string; readonly tool: string } | undefined => {
  if (!toolName.startsWith("mcp__")) return undefined
  const rest = toolName.slice("mcp__".length)
  const separator = rest.indexOf("__")
  if (separator <= 0) return undefined
  return { server: rest.slice(0, separator), tool: rest.slice(separator + 2) }
}
