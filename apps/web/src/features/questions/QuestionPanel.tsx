import { useAtomSet } from "@effect/atom-react"
import {
  answerFor,
  collectAnswers,
  EMPTY_QUESTION_DRAFT,
  type PendingConfirmation,
  type Question,
  type QuestionAnswers,
  type QuestionDraft,
  toggleOption,
  typeOwnAnswer,
} from "@humanity/contracts"
import { cn } from "cn"
import { Exit } from "effect"
import { ArrowDown, ArrowUp, Check } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { decideConfirmationAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"

/** The row's number, filled once the row is part of the answer. */
function RowMark({
  index,
  chosen,
  multi,
}: {
  readonly index: number
  readonly chosen: boolean
  readonly multi: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md text-xs font-medium tabular-nums",
        chosen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {chosen && multi ? <Check className="size-3" /> : index + 1}
    </span>
  )
}

/**
 * The agent's questions, in place of the message box until they are answered:
 * one question at a time, its options as numbered rows, and a last row to
 * type an answer of one's own. Arrows move, a number or Space picks, Enter
 * goes on. "Talk about it" sends no answer and gives the message box back.
 */
export function QuestionPanel({
  confirmation,
  questions,
}: {
  readonly confirmation: PendingConfirmation
  readonly questions: ReadonlyArray<Question>
}) {
  const decide = useAtomSet(decideConfirmationAtom, { mode: "promiseExit" })
  const [step, setStep] = useState(0)
  const [drafts, setDrafts] = useState<ReadonlyArray<QuestionDraft>>(() =>
    questions.map(() => EMPTY_QUESTION_DRAFT),
  )
  const [active, setActive] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const panel = useRef<HTMLDivElement>(null)
  const ownInput = useRef<HTMLInputElement>(null)

  const question = questions[step] ?? questions[0]
  const draft = drafts[step] ?? EMPTY_QUESTION_DRAFT
  const ownRow = question?.options.length ?? 0
  const last = step === questions.length - 1

  // The keyboard belongs to the panel: the own-answer field on its row, the panel otherwise.
  useEffect(() => {
    if (active === ownRow) ownInput.current?.focus()
    else panel.current?.focus()
  }, [active, ownRow, step])

  if (question === undefined) return null
  const multi = question.multiSelect === true
  const answered = answerFor(question, draft) !== ""
  const answers = collectAnswers(questions, drafts)

  const withDraft = (next: QuestionDraft) =>
    drafts.map((existing, index) => (index === step ? next : existing))

  const send = async (
    payload:
      | { readonly decision: "allow"; readonly answers: QuestionAnswers }
      | { readonly decision: "deny" },
  ) => {
    if (pending) return
    setPending(true)
    setError(undefined)
    const exit = await decide({ payload: { confirmationId: confirmation.id, ...payload } })
    setPending(false)
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  const goTo = (next: number) => {
    setStep(next)
    setActive(0)
  }

  /** On to the next question, or off to the agent once the last one is answered. */
  const advance = (current: ReadonlyArray<QuestionDraft>) => {
    if (answerFor(question, current[step] ?? EMPTY_QUESTION_DRAFT) === "") return
    if (!last) return goTo(step + 1)
    const complete = collectAnswers(questions, current)
    if (complete === undefined) return
    void send({ decision: "allow", answers: complete })
  }

  const pick = (index: number) => {
    const option = question.options[index]
    if (option === undefined) return drafts
    const next = withDraft(toggleOption(question, draft, option.label))
    setDrafts(next)
    setActive(index)
    return next
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement
    const typing = target === ownInput.current
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const rows = ownRow + 1
      setActive((active + (event.key === "ArrowDown" ? 1 : rows - 1)) % rows)
      return
    }
    // The footer's buttons keep their own Enter and Space.
    if (target.closest("[data-question-action]") !== null) return
    if (event.key === "Enter") {
      event.preventDefault()
      // Enter on a single-select row picks it and moves on in one go.
      advance(!typing && !multi && active < ownRow ? pick(active) : drafts)
      return
    }
    if (typing) return
    if (event.key === " ") {
      event.preventDefault()
      if (active < ownRow) pick(active)
      return
    }
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= ownRow + 1) {
      event.preventDefault()
      if (digit === ownRow + 1) setActive(ownRow)
      else pick(digit - 1)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error !== undefined && <ErrorNote title="The answer was not sent" message={error} />}
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`The agent asks: ${question.question}`}
        onKeyDown={onKeyDown}
        className="rounded-2xl border border-border/60 bg-muted shadow-xs outline-none"
      >
        <div className="flex items-start gap-2 px-4 py-2.5 text-sm">
          {question.header !== undefined && question.header !== "" && (
            <Badge variant="secondary" className="mt-px shrink-0">
              {question.header}
            </Badge>
          )}
          <p className="min-w-0 flex-1 font-medium">{question.question}</p>
          {questions.length > 1 && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {step + 1} of {questions.length}
            </span>
          )}
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-2">
          {multi && <p className="px-2 pb-1 text-xs text-muted-foreground">Pick all that apply.</p>}
          <ul className="flex flex-col">
            {question.options.map((option, index) => {
              const chosen = draft.selected.includes(option.label)
              return (
                <li key={option.label}>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-pressed={chosen}
                    data-active={active === index}
                    onClick={() => pick(index)}
                    onMouseMove={() => setActive(index)}
                    className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none data-[active=true]:bg-accent"
                  >
                    <RowMark index={index} chosen={chosen} multi={multi} />
                    <span className="min-w-0">
                      <span className="mr-2 font-medium">{option.label}</span>
                      {option.description !== undefined && (
                        <span className="text-muted-foreground">{option.description}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
            <li
              data-active={active === ownRow}
              onMouseMove={() => setActive(ownRow)}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 data-[active=true]:bg-accent"
            >
              <RowMark index={ownRow} chosen={draft.own.trim() !== ""} multi={multi} />
              <input
                ref={ownInput}
                value={draft.own}
                onChange={(event) =>
                  setDrafts(withDraft(typeOwnAnswer(question, draft, event.target.value)))
                }
                onFocus={() => setActive(ownRow)}
                placeholder="Type your own"
                aria-label="Your own answer"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 px-2 pt-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Kbd>
                <ArrowUp />
              </Kbd>
              <Kbd>
                <ArrowDown />
              </Kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <div className="ml-auto flex items-center gap-1" data-question-action>
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => goTo(step - 1)} disabled={pending}>
                  Back
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void send({ decision: "deny" })}
                disabled={pending}
                title="Send no answer and discuss it with the agent in the chat instead"
              >
                Talk about it
              </Button>
              <Button
                size="sm"
                onClick={() => advance(drafts)}
                disabled={pending || (last ? answers === undefined : !answered)}
              >
                {last ? "Submit" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
