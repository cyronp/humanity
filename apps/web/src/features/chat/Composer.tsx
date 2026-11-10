import { useAtomSet } from "@effect/atom-react"
import type { SessionId } from "@humanity/contracts"
import { Exit } from "effect"
import { SendHorizontal } from "lucide-react"
import { type FormEvent, type KeyboardEvent, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { sendMessageAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"

/** The message box. Enter sends, Shift+Enter adds a line. Follow-ups are queued while the agent works. */
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
      <div className="flex items-end gap-2">
        <Textarea
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
          className="max-h-60 min-h-20 resize-y"
          aria-label="Message to the agent"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || pending || text.trim() === ""}
          aria-label="Send"
        >
          <SendHorizontal />
        </Button>
      </div>
    </form>
  )
}
