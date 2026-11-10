import { useAtomSet } from "@effect/atom-react"
import type { SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { type FormEvent, type KeyboardEvent, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
import { sendMessageAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"
import { ChatBox, ChatBoxFooter, SendButton } from "./ChatBox.tsx"

/** The message box of an open thread. Enter sends, Shift+Enter adds a line. Follow-ups are queued while the agent works. */
export function Composer({
  sessionId,
  disabled,
  busy,
}: {
  readonly sessionId: SessionId
  readonly disabled: boolean
  readonly busy: boolean
}) {
  const send = useAtomSet(sendMessageAtom, { mode: "promiseExit" })
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = text.trim()
    if (trimmed === "" || pending || disabled) return
    setPending(true)
    setError(undefined)
    const exit = await send({ payload: { sessionId, text: trimmed } })
    setPending(false)
    if (Exit.isSuccess(exit)) setText("")
    else setError(describeCause(exit.cause))
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
      <ChatBox>
        <InputGroupTextarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
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
          {busy && (
            <InputGroupText className="px-1.5 text-xs font-normal">
              Queued until the agent finishes
            </InputGroupText>
          )}
          <div className="ml-auto">
            <SendButton
              ready={!disabled && !pending && text.trim() !== ""}
              disabled={disabled || pending || text.trim() === ""}
              label="Send"
            />
          </div>
        </ChatBoxFooter>
      </ChatBox>
    </form>
  )
}
