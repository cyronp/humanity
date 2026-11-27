import { useAtomSet } from "@effect/atom-react"
import {
  type AgentProvider,
  type Autonomy,
  DEFAULT_ACCOUNT,
  type ProjectId,
  type ReasoningEffort,
  type SessionId,
} from "@humanity/contracts"
import { Exit } from "effect"
import {
  type FormEvent,
  memo,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { ErrorNote } from "@/components/ErrorNote"
import type { PromptInsertion } from "@/features/extensions/prompt"
import { AutonomyPicker } from "@/features/policy/AutonomyPicker"
import { ModelPicker } from "@/features/providers/ModelPicker"
import type { ModelChoice } from "@/features/providers/models"
import {
  interruptAtom,
  searchSessionFilesAtom,
  sendMessageAtom,
  setAutonomyAtom,
  setEffortAtom,
  setModelAtom,
  switchProviderAtom,
} from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { AddMenu } from "./AddMenu.tsx"
import { SendButton, StopButton } from "./ChatBox.tsx"
import { PromptBox, usePromptDraft } from "./PromptBox.tsx"
import { useAction } from "@/lib/useAction"

export interface ComposerHandle {
  readonly insert: (insertion: PromptInsertion) => void
  readonly attach: (files: ReadonlyArray<File>) => void
  readonly openModelPicker: () => void
  readonly replace: (text: string) => void
  readonly changeAutonomy: (autonomy: Autonomy) => void
  readonly changeModel: (choice: ModelChoice) => void
  readonly changeEffort: (effort: ReasoningEffort | null) => void
}

export const Composer = memo(function Composer({
  sessionId,
  projectId,
  autonomy,
  provider,
  model,
  effort,
  accountId,
  disabled,
  busy,
  onTypingChange,
  ref,
}: {
  readonly ref?: Ref<ComposerHandle>
  readonly sessionId: SessionId
  readonly projectId: ProjectId
  readonly autonomy: Autonomy
  readonly provider: AgentProvider
  readonly model: string | null
  readonly effort: ReasoningEffort | null
  readonly accountId: string | null
  readonly disabled: boolean
  readonly busy: boolean
  readonly onTypingChange?: ((typing: boolean) => void) | undefined
}) {
  const { run: send, error, pending } = useAction(sendMessageAtom)
  const { run: updateAutonomy, error: autonomyError } = useAction(setAutonomyAtom)
  const updateModel = useAtomSet(setModelAtom, { mode: "promiseExit" })
  const moveThread = useAtomSet(switchProviderAtom, { mode: "promiseExit" })
  const { run: updateEffort, error: effortError } = useAction(setEffortAtom)
  const { run: interrupt, error: stopError, pending: stopping } = useAction(interruptAtom)
  const [modelError, setModelError] = useState<string>()
  const searchFiles = useAtomSet(searchSessionFilesAtom, { mode: "promiseExit" })
  const draft = usePromptDraft({
    search: (query, recent) => searchFiles({ payload: { sessionId, query, recent } }),
    recentScope: projectId,
    disabled,
  })
  const { text, setText, files, textarea, insert } = draft
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerQueue = useRef<Promise<void>>(Promise.resolve())
  const inOrder = (task: () => Promise<void>) => {
    pickerQueue.current = pickerQueue.current.then(task)
  }
  useImperativeHandle(ref, () => ({
    insert,
    attach: (added) => void files.add(added),
    openModelPicker: () => setPickerOpen(true),
    replace: (next) => {
      setText(next)
      textarea.current?.focus()
    },
    changeAutonomy: (next) => void changeAutonomy(next),
    changeModel: (choice) => void changeModel(choice),
    changeEffort: (next) => void changeEffort(next),
  }))
  const typing = !disabled && text.trim() !== ""
  useEffect(() => onTypingChange?.(typing), [typing, onTypingChange])

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = text.trim()
    if (trimmed === "" || pending || disabled || files.reading) return
    const exit = await send({
      payload: {
        sessionId,
        text: trimmed,
        ...draft.extras,
      },
    })
    if (Exit.isSuccess(exit)) draft.sent()
  }

  const stop = async () => {
    await interrupt({ payload: { sessionId } })
  }
  const canStop = busy && !disabled && text.trim() === ""

  const changeAutonomy = async (next: Autonomy) => {
    await updateAutonomy({ payload: { sessionId, autonomy: next } })
  }

  const changeModel = async (choice: ModelChoice) => {
    setModelError(undefined)
    const sameAgent =
      choice.provider === provider &&
      (choice.accountId === undefined || choice.accountId === (accountId ?? DEFAULT_ACCOUNT))
    const exit = sameAgent
      ? await updateModel({ payload: { sessionId, model: choice.model } })
      : await moveThread({
          payload: {
            sessionId,
            provider: choice.provider,
            model: choice.model,
            ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
          },
        })
    if (Exit.isFailure(exit)) setModelError(describeCause(exit.cause))
  }

  const changeEffort = async (next: ReasoningEffort | null) => {
    await updateEffort({ payload: { sessionId, effort: next } })
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
      <PromptBox
        draft={draft}
        disabled={disabled}
        onSubmit={() => void submit()}
        placeholder={disabled ? "This session has ended." : "Ask anything. @ files."}
        label="Message to the agent"
        className="max-h-60 min-h-16"
        footer={
          <>
            <AddMenu
              projectId={projectId}
              onFiles={(picked) => void files.add(picked)}
              onInsert={insert}
              disabled={disabled}
            />
            <AutonomyPicker
              value={autonomy}
              projectId={projectId}
              onChange={changeAutonomy}
              disabled={disabled}
            />
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <ModelPicker
                provider={provider}
                value={model}
                onChange={(choice) => inOrder(() => changeModel(choice))}
                effort={effort}
                onEffortChange={(next) => inOrder(() => changeEffort(next))}
                locked={busy}
                movesThread
                accountId={accountId ?? DEFAULT_ACCOUNT}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
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
          </>
        }
      />
    </form>
  )
})
