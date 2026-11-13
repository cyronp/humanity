import { useAtomSet } from "@effect/atom-react"
import type { Autonomy, ProjectId, ReasoningEffort, SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { type FormEvent, type KeyboardEvent, type Ref, useImperativeHandle, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
import type { PromptInsertion } from "@/features/extensions/prompt"
import { usePromptInsert } from "@/features/extensions/usePromptInsert"
import { AutonomyPicker } from "@/features/policy/AutonomyPicker"
import { ModelPicker } from "@/features/providers/ModelPicker"
import { ReasoningPicker } from "@/features/providers/ReasoningPicker"
import {
  interruptAtom,
  sendMessageAtom,
  setAutonomyAtom,
  setEffortAtom,
  setModelAtom,
} from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { AttachmentTray, dropTargetClass, useAttachmentDraft } from "./attachments.tsx"
import { AddMenu } from "./AddMenu.tsx"
import { ChatBox, ChatBoxFooter, SendButton, StopButton } from "./ChatBox.tsx"

export interface ComposerHandle {
  /** Writes at the caret and gives the box the focus. */
  readonly insert: (insertion: PromptInsertion) => void
}

/**
 * The message box of an open thread. Enter sends, Shift+Enter adds a line.
 * Follow-ups are queued while the agent works; with nothing typed, the send
 * button is a red stop for the agent's current turn instead.
 */
export function Composer({
  sessionId,
  projectId,
  autonomy,
  model,
  effort,
  disabled,
  busy,
  ref,
}: {
  readonly ref?: Ref<ComposerHandle>
  readonly sessionId: SessionId
  /** The session's project, whose repository may bring skills and MCP servers of its own. */
  readonly projectId: ProjectId
  /** The session's current autonomy; it changes from the next tool call on. */
  readonly autonomy: Autonomy
  /** The session's model; `null` is Claude Code's default. */
  readonly model: string | null
  /** The session's reasoning effort; `null` is the model's default. */
  readonly effort: ReasoningEffort | null
  readonly disabled: boolean
  readonly busy: boolean
}) {
  const send = useAtomSet(sendMessageAtom, { mode: "promiseExit" })
  const updateAutonomy = useAtomSet(setAutonomyAtom, { mode: "promiseExit" })
  const updateModel = useAtomSet(setModelAtom, { mode: "promiseExit" })
  const updateEffort = useAtomSet(setEffortAtom, { mode: "promiseExit" })
  const interrupt = useAtomSet(interruptAtom, { mode: "promiseExit" })
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState<string>()
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [autonomyError, setAutonomyError] = useState<string>()
  const [modelError, setModelError] = useState<string>()
  const [effortError, setEffortError] = useState<string>()
  const files = useAttachmentDraft()
  const { textarea, insert } = usePromptInsert(text, setText)
  // No dependencies: `insert` reads the text of the render it was made in.
  useImperativeHandle(ref, () => ({ insert }))

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = text.trim()
    if (trimmed === "" || pending || disabled || files.reading) return
    setPending(true)
    setError(undefined)
    const exit = await send({
      payload: {
        sessionId,
        text: trimmed,
        ...(files.uploads.length === 0 ? {} : { attachments: files.uploads }),
      },
    })
    setPending(false)
    if (Exit.isSuccess(exit)) {
      setText("")
      files.clear()
    } else setError(describeCause(exit.cause))
  }

  // The session's status event then turns `busy` off, and the stop back into send.
  const stop = async () => {
    setStopping(true)
    setStopError(undefined)
    const exit = await interrupt({ payload: { sessionId } })
    setStopping(false)
    if (Exit.isFailure(exit)) setStopError(describeCause(exit.cause))
  }
  // A typed message is queued rather than stopping anything, so it keeps its send button.
  const canStop = busy && !disabled && text.trim() === ""

  // The session's `SessionUpdated` event brings the new value back into `autonomy`.
  const changeAutonomy = async (next: Autonomy) => {
    setAutonomyError(undefined)
    const exit = await updateAutonomy({ payload: { sessionId, autonomy: next } })
    if (Exit.isFailure(exit)) setAutonomyError(describeCause(exit.cause))
  }

  // Like the autonomy, the new model comes back through `SessionUpdated`.
  const changeModel = async (next: string | null) => {
    setModelError(undefined)
    const exit = await updateModel({ payload: { sessionId, model: next } })
    if (Exit.isFailure(exit)) setModelError(describeCause(exit.cause))
  }

  const changeEffort = async (next: ReasoningEffort | null) => {
    setEffortError(undefined)
    const exit = await updateEffort({ payload: { sessionId, effort: next } })
    if (Exit.isFailure(exit)) setEffortError(describeCause(exit.cause))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {error !== undefined && <ErrorNote title="The message was not sent" message={error} />}
      {stopError !== undefined && (
        <ErrorNote title="The agent was not stopped" message={stopError} />
      )}
      {autonomyError !== undefined && (
        <ErrorNote title="The autonomy was not changed" message={autonomyError} />
      )}
      {modelError !== undefined && (
        <ErrorNote title="The model was not changed" message={modelError} />
      )}
      {effortError !== undefined && (
        <ErrorNote title="The reasoning effort was not changed" message={effortError} />
      )}
      {files.error !== undefined && (
        <ErrorNote title="Some files were not attached" message={files.error} />
      )}
      <ChatBox className={dropTargetClass} {...(disabled ? {} : files.dropProps)}>
        <AttachmentTray draft={files} />
        <InputGroupTextarea
          ref={textarea}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={disabled ? undefined : files.onPaste}
          placeholder={
            disabled
              ? "This session has ended."
              : busy
                ? "The agent is working. A message sent now is read when it finishes."
                : "Ask the agent something about the repository…"
          }
          disabled={disabled}
          rows={3}
          className="max-h-60 min-h-16 px-4 pt-3.5"
          aria-label="Message to the agent"
        />
        <ChatBoxFooter>
          <AddMenu
            projectId={projectId}
            onFiles={(picked) => void files.add(picked)}
            onInsert={insert}
            disabled={disabled}
          />
          <AutonomyPicker value={autonomy} onChange={changeAutonomy} disabled={disabled} />
          {busy && (
            <InputGroupText className="px-1.5 text-xs font-normal">
              Queued until the agent finishes
            </InputGroupText>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ReasoningPicker value={effort} onChange={changeEffort} disabled={disabled} />
            <ModelPicker value={model} onChange={changeModel} disabled={disabled} />
            {canStop ? (
              <StopButton onStop={() => void stop()} stopping={stopping} />
            ) : (
              <SendButton
                ready={!disabled && !pending && !files.reading && text.trim() !== ""}
                disabled={disabled || pending || files.reading || text.trim() === ""}
                label="Send"
              />
            )}
          </div>
        </ChatBoxFooter>
      </ChatBox>
    </form>
  )
}
