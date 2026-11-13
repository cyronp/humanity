import { parseMcpToolName, parseQuestions, QUESTION_TOOL } from "@humanity/contracts"
import { MessageCircleQuestion, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/features/chat/Markdown"
import { describeInput, stringField } from "../inputs.ts"
import type { ToolCallProps, ToolRenderer } from "../registry.ts"
import { Field, JsonBlock, OutputText } from "./common.tsx"

function Output({ call }: ToolCallProps) {
  const output = call?.output
  if (output == null) return null
  return (
    <Field label={output.isError ? "Error" : "Result"}>
      <OutputText text={output.content} error={output.isError} />
    </Field>
  )
}

export const skillRenderer: ToolRenderer = {
  name: "Skill",
  match: (toolName) => toolName === "Skill",
  Summary: ({ input }) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <Sparkles className="size-3.5 shrink-0 text-violet-500" />
      <span className="text-muted-foreground">Loaded skill</span>
      <Badge variant="secondary" className="font-mono">
        {stringField(input, "skill") ?? "unknown"}
      </Badge>
    </span>
  ),
  Detail: (props) => {
    const args = stringField(props.input, "args")
    return (
      <div className="flex flex-col gap-2">
        <p>
          The agent loaded the <code>{stringField(props.input, "skill") ?? "unknown"}</code> skill:
          its instructions are now part of the conversation.
        </p>
        {args !== undefined && (
          <Field label="Why / arguments">
            <p className="whitespace-pre-wrap">{args}</p>
          </Field>
        )}
        <Output {...props} />
      </div>
    )
  },
}

/** Subagents: the Agent SDK's `Task` (also called `Agent`) tool. */
export const subagentRenderer: ToolRenderer = {
  name: "Subagent",
  match: (toolName) => toolName === "Task" || toolName === "Agent",
  Summary: ({ input }) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-muted-foreground">Subagent</span>
      {stringField(input, "subagent_type") !== undefined && (
        <Badge variant="secondary">{stringField(input, "subagent_type")}</Badge>
      )}
      <span className="truncate">{stringField(input, "description") ?? ""}</span>
    </span>
  ),
  Detail: (props) => {
    const prompt = stringField(props.input, "prompt")
    return (
      <div className="flex flex-col gap-2">
        {prompt !== undefined && (
          <Field label="Task">
            <div className="rounded-md border bg-muted/40 p-2">
              <Markdown text={prompt} />
            </div>
          </Field>
        )}
        {props.call?.output != null && (
          <Field label="Report">
            <div className="rounded-md border p-2">
              <Markdown text={props.call.output.content} />
            </div>
          </Field>
        )}
      </div>
    )
  },
}

export const questionRenderer: ToolRenderer = {
  name: "Question",
  match: (toolName, input) => toolName === QUESTION_TOOL && parseQuestions(input) !== undefined,
  Summary: ({ input }) => {
    const questions = parseQuestions(input) ?? []
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <MessageCircleQuestion className="size-3.5 shrink-0 text-amber-600" />
        <span className="text-muted-foreground">Asked</span>
        <span className="truncate">{questions[0]?.question}</span>
        {questions.length > 1 && (
          <span className="shrink-0 text-muted-foreground">+{questions.length - 1} more</span>
        )}
      </span>
    )
  },
  Detail: ({ input, approval }) => {
    const confirmation = approval?._tag === "confirmation" ? approval.confirmation : undefined
    const unanswered =
      confirmation?.status === "denied"
        ? "You chose to talk about it instead."
        : confirmation?.status === "expired"
          ? "Not answered."
          : confirmation?.status === "pending"
            ? "Waiting for your answer."
            : undefined
    return (
      <div className="flex flex-col gap-2">
        {(parseQuestions(input) ?? []).map((question) => (
          <Field key={question.question} label={question.question}>
            {confirmation?.answers?.[question.question] !== undefined ? (
              <p className="font-medium">{confirmation.answers[question.question]}</p>
            ) : (
              <ul className="list-disc pl-4 text-muted-foreground">
                {question.options.map((option) => (
                  <li key={option.label}>{option.label}</li>
                ))}
              </ul>
            )}
          </Field>
        ))}
        {unanswered !== undefined && <p className="text-muted-foreground">{unanswered}</p>}
      </div>
    )
  },
}

export const mcpRenderer: ToolRenderer = {
  name: "MCP",
  match: (toolName) => parseMcpToolName(toolName) !== undefined,
  Summary: ({ toolName, input }) => {
    const parsed = parseMcpToolName(toolName)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge variant="outline">MCP</Badge>
        <Badge variant="secondary" className="font-mono">
          {parsed?.server}
        </Badge>
        <Badge className="font-mono">{parsed?.tool}</Badge>
        <span className="truncate font-mono text-muted-foreground">{describeInput(input)}</span>
      </span>
    )
  },
  Detail: (props) => (
    <div className="flex flex-col gap-2">
      <Field label="Input">
        <JsonBlock value={props.input} />
      </Field>
      <Output {...props} />
    </div>
  ),
}

/** Everything without a renderer of its own: name, then the raw input and output. */
export const genericRenderer: ToolRenderer = {
  name: "Generic",
  match: () => true,
  Summary: ({ toolName, input }) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <Badge variant="outline" className="font-mono">
        {toolName}
      </Badge>
      <span className="truncate font-mono text-muted-foreground">{describeInput(input)}</span>
    </span>
  ),
  Detail: (props) => (
    <div className="flex flex-col gap-2">
      <Field label="Input">
        <JsonBlock value={props.input} />
      </Field>
      {props.call?.structuredOutput !== undefined ? (
        <Field label="Result">
          <JsonBlock value={props.call.structuredOutput} />
        </Field>
      ) : (
        <Output {...props} />
      )}
    </div>
  ),
}
