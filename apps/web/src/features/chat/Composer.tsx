import { useAtomSet } from "@effect/atom-react"
import type {
  AgentProvider,
  Autonomy,
  ProjectId,
  ReasoningEffort,
  SessionId,
} from "@humanity/contracts"
import { Exit } from "effect"
import {
  type FormEvent,
  type KeyboardEvent,
  memo,
  type Ref,
  useId,
  useImperativeHandle,
  useState,
} from "react"
import { ErrorNote } from "@/components/ErrorNote"
import type { PromptInsertion } from "@/features/extensions/prompt"
import { usePromptInsert } from "@/features/extensions/usePromptInsert"
import { AutonomyPicker } from "@/features/policy/AutonomyPicker"
import { ModelPicker } from "@/features/providers/ModelPicker"
import { ReasoningPicker } from "@/features/providers/ReasoningPicker"
import {
  interruptAtom,
  searchSessionFilesAtom,
  sendMessageAtom,
  setAutonomyAtom,
  setEffortAtom,
  setModelAtom,
} from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { AttachmentTray, dropTargetClass, useAttachmentDraft } from "./attachments.tsx"
import { AddMenu } from "./AddMenu.tsx"
import { ChatBox, ChatBoxFooter, SendButton, StopButton } from "./ChatBox.tsx"
import { FileMentionMenu, fileMentionIds } from "./FileMentionMenu.tsx"
import { MentionTextarea } from "./MentionTextarea.tsx"
import { useFileMention } from "./useFileMention.ts"

export interface ComposerHandle {
  readonly insert: (insertion: PromptInsertion) => void
  /** Adds files to the message, as a drop or a paste does. */
  readonly attach: (files: ReadonlyArray<File>) => void
}

export const Composer = memo(function Composer({
  sessionId,
  projectId,
  autonomy,
  provider,
  model,
  effort,
  disabled,
  busy,
  ref,
}: {
  readonly ref?: Ref<ComposerHandle>
  readonly sessionId: SessionId
  readonly projectId: ProjectId
  readonly autonomy: Autonomy
  readonly provider: AgentProvider
  readonly model: string | null
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
  useImperativeHandle(ref, () => ({ insert, attach: (added) => void files.add(added) }))
  const searchFiles = useAtomSet(searchSessionFilesAtom, { mode: "promiseExit" })
  const mentions = useFileMention({
    text,
    setText,
    textarea,
    search: (query, recent) => searchFiles({ payload: { sessionId, query, recent } }),
    recentScope: projectId,
    disabled,
  })
  const idBase = useId()
  const mentionIds = fileMentionIds(idBase)

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
        ...(mentions.picked.length === 0 ? {} : { mentions: mentions.picked }),
      },
    })
    setPending(false)
    if (Exit.isSuccess(exit)) {
      setText("")
      mentions.sent()
      files.clear()
    } else setError(describeCause(exit.cause))
  }

  const stop = async () => {
    setStopping(true)
    setStopError(undefined)
    const exit = await interrupt({ payload: { sessionId } })
    setStopping(false)
    if (Exit.isFailure(exit)) setStopError(describeCause(exit.cause))
  }
  const canStop = busy && !disabled && text.trim() === ""

  const changeAutonomy = async (next: Autonomy) => {
    setAutonomyError(undefined)
    const exit = await updateAutonomy({ payload: { sessionId, autonomy: next } })
    if (Exit.isFailure(exit)) setAutonomyError(describeCause(exit.cause))
  }

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
    if (mentions.onKeyDown(event)) return
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
      <ChatBox
        className={dropTargetClass}
        behind={
          mentions.menu !== undefined && <FileMentionMenu menu={mentions.menu} idBase={idBase} />
        }
        {...(disabled ? {} : files.dropProps)}
      >
        <AttachmentTray draft={files} />
        <MentionTextarea
          ref={textarea}
          value={text}
          mentions={mentions.picked}
          {...mentions.textareaProps}
          aria-controls={mentions.menu === undefined ? undefined : mentionIds.list}
          aria-activedescendant={
            mentions.menu === undefined || mentions.menu.highlighted < 0
              ? undefined
              : mentionIds.option(mentions.menu.highlighted)
          }
          onKeyDown={onKeyDown}
          onPaste={disabled ? undefined : files.onPaste}
          placeholder={disabled ? "This session has ended." : "Ask anything. @ files."}
          disabled={disabled}
          rows={3}
          className="max-h-60 min-h-16"
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
          <div className="ml-auto flex items-center gap-1">
            <ReasoningPicker value={effort} onChange={changeEffort} disabled={disabled} />
            <ModelPicker
              provider={provider}
              value={model}
              onChange={(choice) => void changeModel(choice.model)}
              locked
              disabled={disabled}
            />
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
})
