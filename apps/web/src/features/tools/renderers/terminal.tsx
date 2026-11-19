import { parseMcpToolName, HUMANITY_MCP_SERVER, isTerminalToolName } from "@humanity/contracts"
import { SquareTerminal } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { showTerminal } from "@/features/terminal/showTerminal"
import { TerminalOutput } from "../CodeBlock.tsx"
import { stringField } from "../inputs.ts"
import type { ToolCallProps, ToolRenderer } from "../registry.ts"
import { Field } from "./common.tsx"

const toolOf = (toolName: string) => {
  const parsed = parseMcpToolName(toolName)
  return parsed?.server === HUMANITY_MCP_SERVER && isTerminalToolName(parsed.tool)
    ? parsed.tool
    : undefined
}

const keysOf = (input: unknown): ReadonlyArray<string> => {
  if (typeof input !== "object" || input === null) return []
  const keys = (input as Record<string, unknown>)["keys"]
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : []
}

const terminalOf = ({ toolName, input, call }: ToolCallProps): string | undefined =>
  stringField(input, "terminal") ??
  (toolOf(toolName) === "terminal_open"
    ? /terminal #(\d+)/.exec(call?.output?.content ?? "")?.[1]
    : undefined)

const label = (terminal: string | undefined) =>
  terminal === undefined ? "a terminal" : `#${terminal.replace(/^#/, "")}`

const typed = (input: unknown) =>
  [stringField(input, "text") ?? "", ...keysOf(input).map((key) => `[${key}]`)]
    .filter((part) => part !== "")
    .join(" ")

const headline = (props: ToolCallProps) => props.call?.output?.content.split("\n")[0]

function Line({ verb, children }: { readonly verb: string; readonly children?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{verb}</span>
      {children}
    </span>
  )
}

function Summary(props: ToolCallProps) {
  const { toolName, input } = props
  const terminal = label(terminalOf(props))
  switch (toolOf(toolName)) {
    case "terminal_list":
      return <Line verb="Listed the terminals" />
    case "terminal_read":
      return (
        <Line verb={`Read terminal ${terminal}`}>
          {stringField(input, "view") === "screen" && (
            <span className="text-muted-foreground">(screen)</span>
          )}
        </Line>
      )
    case "terminal_send":
      return (
        <Line verb={`Typed into ${terminal}`}>
          <code className="truncate font-mono">{typed(input)}</code>
        </Line>
      )
    case "terminal_wait": {
      const done = headline(props)
      return (
        <Line verb={`Waited on ${terminal} for ${stringField(input, "for") ?? "it"}`}>
          {done !== undefined && <span className="truncate text-muted-foreground">· {done}</span>}
        </Line>
      )
    }
    case "terminal_open": {
      const command = stringField(input, "command")
      return (
        <Line verb="Opened a terminal">
          {stringField(input, "title") !== undefined && (
            <span className="shrink-0">{stringField(input, "title")}</span>
          )}
          {command !== undefined && (
            <code className="truncate font-mono">
              <span className="text-muted-foreground select-none">$ </span>
              {command}
            </code>
          )}
        </Line>
      )
    }
    case "terminal_close":
      return <Line verb={`Closed terminal ${terminal}`} />
    default:
      return <Line verb={toolName} />
  }
}

function Detail(props: ToolCallProps) {
  const { toolName, input, call } = props
  const tool = toolOf(toolName)
  const terminal = terminalOf(props)
  const sent = tool === "terminal_send" ? typed(input) : ""
  const command = tool === "terminal_open" ? stringField(input, "command") : undefined
  const output = call?.output
  return (
    <div className="flex flex-col gap-2">
      {sent !== "" && (
        <Field label="Typed">
          <pre className="rounded-md bg-muted p-2 font-mono whitespace-pre-wrap break-all">
            {sent}
            {stringField(input, "text") !== undefined &&
              (input as Record<string, unknown>)["enter"] !== false &&
              " ⏎"}
          </pre>
        </Field>
      )}
      {command !== undefined && (
        <Field label="Command">
          <pre className="rounded-md bg-muted p-2 font-mono whitespace-pre-wrap break-all">
            {command}
          </pre>
        </Field>
      )}
      {tool === "terminal_wait" && stringField(input, "pattern") !== undefined && (
        <Field label="Pattern">
          <code className="font-mono">{stringField(input, "pattern")}</code>
        </Field>
      )}
      {output != null && (
        <Field label={output.isError ? "Error" : "Result"}>
          <TerminalOutput
            text={output.content}
            {...(output.isError ? { className: "border-destructive/40" } : {})}
          />
        </Field>
      )}
      {terminal !== undefined && tool !== "terminal_close" && (
        <div>
          <Button size="xs" variant="outline" onClick={() => showTerminal(terminal)}>
            <SquareTerminal />
            Show terminal {label(terminal)}
          </Button>
        </div>
      )}
    </div>
  )
}

export const terminalRenderer: ToolRenderer = {
  name: "Terminal",
  match: (toolName) => toolOf(toolName) !== undefined,
  Summary,
  Detail,
}
