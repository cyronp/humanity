import { OPEN_THREAD_TOOL } from "@humanity/contracts"
import { MessageSquarePlus } from "lucide-react"
import { Markdown } from "@/features/chat/Markdown"
import { stringField } from "../inputs.ts"
import type { ToolRenderer } from "../registry.ts"
import { Field, OutputText } from "./common.tsx"

/**
 * Humanity's own tool: the agent opening a new thread at the human's request.
 * The link to the thread is in the agent's reply; here is what it asked for.
 */
export const threadRenderer: ToolRenderer = {
  name: "Thread",
  match: (toolName) => toolName === OPEN_THREAD_TOOL,
  Summary: ({ input, call }) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <MessageSquarePlus className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">
        {call?.status === "succeeded" ? "Opened thread" : "Open thread"}
      </span>
      <span className="truncate">
        {stringField(input, "title") ?? stringField(input, "prompt")}
      </span>
    </span>
  ),
  Detail: ({ input, call }) => {
    const prompt = stringField(input, "prompt")
    const runsOn = [stringField(input, "model"), stringField(input, "effort")]
      .filter((part) => part !== undefined)
      .join(" · ")
    return (
      <div className="flex flex-col gap-2">
        {runsOn !== "" && (
          <Field label="Runs on">
            <p>{runsOn}</p>
          </Field>
        )}
        {prompt !== undefined && (
          <Field label="Prompt">
            <div className="rounded-md border bg-muted/40 p-2">
              <Markdown text={prompt} />
            </div>
          </Field>
        )}
        {call?.output != null &&
          (call.output.isError ? (
            <Field label="Error">
              <OutputText text={call.output.content} error />
            </Field>
          ) : (
            // The result carries the thread's link, which reads as the thread here too.
            <Field label="Result">
              <div className="rounded-md border p-2">
                <Markdown text={call.output.content} />
              </div>
            </Field>
          ))}
      </div>
    )
  },
}
