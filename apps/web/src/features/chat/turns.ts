import {
  type AssistantBlock,
  type ChatMessage,
  type MessageContent,
  PATCH_TOOL,
  SHELL_TOOL,
  TERMINAL_TOOLS,
  THREAD_HISTORY_TOOL,
} from "@humanity/contracts"
import { describeInput, shortPath, stringField } from "@/features/tools/inputs"
import { patchFiles } from "@/features/tools/patch"

type Content<Tag extends MessageContent["_tag"]> = Extract<MessageContent, { _tag: Tag }>

export type TranscriptItem =
  | { readonly _tag: "message"; readonly id: string; readonly message: ChatMessage }
  | {
      readonly _tag: "turn"
      readonly id: string
      readonly startedAt: string
      readonly messages: ReadonlyArray<ChatMessage>
    }

export const transcriptItems = (
  messages: ReadonlyArray<ChatMessage>,
): ReadonlyArray<TranscriptItem> => {
  const items: Array<TranscriptItem> = []
  let turn: Array<ChatMessage> | undefined
  let startedAt: string | undefined
  for (const message of messages) {
    const tag = message.content._tag
    if (tag === "tool_results" || tag === "other") continue
    if (tag === "assistant" || tag === "system_init" || tag === "result") {
      if (turn === undefined) {
        turn = []
        items.push({
          _tag: "turn",
          id: message.id,
          startedAt: startedAt ?? message.createdAt,
          messages: turn,
        })
      }
      turn.push(message)
      if (tag === "result") turn = undefined
      continue
    }
    turn = undefined
    if (tag === "user") startedAt = message.createdAt
    items.push({ _tag: "message", id: message.id, message })
  }
  return items
}

export const itemOfMessage = (
  items: ReadonlyArray<TranscriptItem>,
): ReadonlyMap<string, string> => {
  const owner = new Map<string, string>()
  for (const item of items) {
    if (item._tag === "message") owner.set(item.id, item.id)
    else for (const message of item.messages) owner.set(message.id, item.id)
  }
  return owner
}

export type Step =
  | { readonly _tag: "text"; readonly text: string }
  | { readonly _tag: "thinking"; readonly text: string }
  | {
      readonly _tag: "tool"
      readonly toolUseId: string
      readonly toolName: string
      readonly input: unknown
    }

export type ToolStep = Extract<Step, { _tag: "tool" }>

export const isToolStep = (step: Step): step is ToolStep => step._tag === "tool"

export interface TurnParts {
  readonly init: Content<"system_init"> | undefined
  readonly steps: ReadonlyArray<Step>
  readonly reply: ReadonlyArray<string>
  readonly subagents: ReadonlyMap<string, ReadonlyArray<Step>>
  readonly result: Content<"result"> | undefined
}

const stepOf = (block: AssistantBlock): Step | undefined => {
  switch (block._tag) {
    case "text":
      return block.text.trim() === "" ? undefined : { _tag: "text", text: block.text }
    case "thinking":
      return block.text === "" ? undefined : { _tag: "thinking", text: block.text }
    case "tool_use":
      return {
        _tag: "tool",
        toolUseId: block.toolUseId,
        toolName: block.toolName,
        input: block.input,
      }
  }
}

export const turnParts = (messages: ReadonlyArray<ChatMessage>): TurnParts => {
  let init: Content<"system_init"> | undefined
  let result: Content<"result"> | undefined
  const all: Array<Step> = []
  const subagents = new Map<string, Array<Step>>()
  for (const message of messages) {
    const content = message.content
    if (content._tag === "system_init") init = content
    else if (content._tag === "result") result = content
    else if (content._tag === "assistant") {
      let target = all
      if (content.parentToolUseId !== null) {
        target = subagents.get(content.parentToolUseId) ?? []
        subagents.set(content.parentToolUseId, target)
      }
      for (const block of content.blocks) {
        const step = stepOf(block)
        if (step !== undefined) target.push(step)
      }
    }
  }
  const lastTool = all.findLastIndex(isToolStep)
  const inReply = (step: Step, index: number) => step._tag === "text" && index > lastTool
  return {
    init,
    steps: all.filter((step, index) => !inReply(step, index)),
    reply: all.flatMap((step, index) =>
      step._tag === "text" && inReply(step, index) ? [step.text] : [],
    ),
    subagents,
    result,
  }
}

export type PhaseKind = "explore" | "edit" | "run" | "other" | "notes"

export interface Phase {
  readonly kind: PhaseKind
  readonly steps: ReadonlyArray<Step>
}

const EXPLORE_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "WebSearch",
  "WebFetch",
  THREAD_HISTORY_TOOL,
])
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", PATCH_TOOL])
const RUN_TOOLS = new Set([SHELL_TOOL, "PowerShell", "BashOutput", "KillShell", ...TERMINAL_TOOLS])

export const toolPhase = (toolName: string): Exclude<PhaseKind, "notes"> =>
  EXPLORE_TOOLS.has(toolName)
    ? "explore"
    : EDIT_TOOLS.has(toolName)
      ? "edit"
      : RUN_TOOLS.has(toolName)
        ? "run"
        : "other"

export const phasesOf = (steps: ReadonlyArray<Step>): ReadonlyArray<Phase> => {
  const phases: Array<{ kind: PhaseKind; steps: Array<Step> }> = []
  for (const step of steps) {
    const last = phases.at(-1)
    if (step._tag !== "tool") {
      if (last === undefined) phases.push({ kind: "notes", steps: [step] })
      else last.steps.push(step)
      continue
    }
    const kind = toolPhase(step.toolName)
    if (last !== undefined && (last.kind === "notes" || (kind !== "other" && last.kind === kind))) {
      last.kind = kind
      last.steps.push(step)
    } else {
      phases.push({ kind, steps: [step] })
    }
  }
  return phases
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const SEARCH_TOOLS = new Set(["Glob", "Grep", "LS"])
const WEB_TOOLS = new Set(["WebSearch", "WebFetch"])

const editedPaths = (tool: ToolStep): ReadonlyArray<string> => {
  if (tool.toolName === PATCH_TOOL) return patchFiles(tool.input).map((file) => file.path)
  const path = stringField(tool.input, "file_path") ?? stringField(tool.input, "notebook_path")
  return path === undefined ? [] : [path]
}

export interface PhaseSummary {
  readonly title: string
  readonly command?: string
  readonly detail?: string
}

export const phaseSummary = (
  phase: Phase,
  running: boolean,
  worktreePath: string,
): PhaseSummary => {
  const tools = phase.steps.filter(isToolStep)
  switch (phase.kind) {
    case "explore": {
      const reads = tools.filter((tool) => tool.toolName === "Read").length
      const searches = tools.filter((tool) => SEARCH_TOOLS.has(tool.toolName)).length
      const web = tools.filter((tool) => WEB_TOOLS.has(tool.toolName)).length
      const others = tools.length - reads - searches - web
      const parts = [
        reads > 0 ? plural(reads, "file read", "files read") : null,
        searches > 0 ? plural(searches, "search", "searches") : null,
        web > 0 ? plural(web, "web lookup", "web lookups") : null,
        others > 0 ? plural(others, "other read", "other reads") : null,
      ].filter((part) => part !== null)
      return { title: running ? "Exploring" : "Explored", detail: parts.join(", ") }
    }
    case "edit": {
      const paths = [...new Set(tools.flatMap(editedPaths))]
      const verb = running ? "Editing" : "Edited"
      if (paths.length === 1) {
        const path = shortPath(paths[0] ?? "", worktreePath)
        return { title: `${verb} ${path.split("/").pop() ?? path}` }
      }
      return { title: `${verb} ${plural(paths.length || tools.length, "file", "files")}` }
    }
    case "run": {
      const verb = running ? "Running" : "Ran"
      const only = tools.length === 1 ? tools[0] : undefined
      if (only !== undefined) return { title: verb, command: describeInput(only.input) }
      return { title: `${verb} ${plural(tools.length, "command", "commands")}` }
    }
    case "other":
    case "notes":
      return { title: "" }
  }
}

export const formatWorked = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes < 60) return restSeconds === 0 ? `${minutes}m` : `${minutes}m ${restSeconds}s`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`
}

export const workedMs = (
  startedAt: string,
  messages: ReadonlyArray<ChatMessage>,
  result: Content<"result"> | undefined,
): number | undefined => {
  if (result !== undefined && result.durationMs > 0) return result.durationMs
  const last = messages.at(-1)
  if (last === undefined) return undefined
  const ms = Date.parse(last.createdAt) - Date.parse(startedAt)
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}
