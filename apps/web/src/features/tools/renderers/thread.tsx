import { useAtomValue } from "@effect/atom-react"
import {
  type AgentProvider,
  OPEN_THREAD_TOOL,
  openedThreadIn,
  PROVIDER_NAMES,
  type SessionId,
} from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { MessageSquarePlus } from "lucide-react"
import { Markdown } from "@/features/chat/Markdown"
import { allSessionsAtom } from "@/features/session/atoms"
import { ThreadStatus } from "@/features/sidebar/ThreadLink"
import { stringField } from "../inputs.ts"
import type { ToolRenderer } from "../registry.ts"
import { Field, OutputText } from "./common.tsx"

const providerName = (provider: string | undefined): string | undefined =>
  provider !== undefined && Object.hasOwn(PROVIDER_NAMES, provider)
    ? PROVIDER_NAMES[provider as AgentProvider]
    : provider

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
      {call?.status === "succeeded" && call.output !== null && (
        <OpenedThreadStatus text={call.output.content} />
      )}
    </span>
  ),
  Detail: ({ input, call }) => {
    const prompt = stringField(input, "prompt")
    const runsOn = [
      providerName(stringField(input, "provider")),
      stringField(input, "model"),
      stringField(input, "effort"),
    ]
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

function OpenedThreadStatus({ text }: { readonly text: string }) {
  const opened = openedThreadIn(text)
  return opened === undefined ? null : <ChildStatus sessionId={opened.sessionId} />
}

function ChildStatus({ sessionId }: { readonly sessionId: SessionId }) {
  const sessions = useAtomValue(allSessionsAtom)
  const child = AsyncResult.isSuccess(sessions)
    ? sessions.value.find((session) => session.id === sessionId)
    : undefined
  if (child === undefined) return null
  return (
    <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
      <ThreadStatus status={child.status} />
    </span>
  )
}
