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
import { Questionnaire as QuestionnairePrimitive } from "@shadcn/react/questionnaire"
import { cn } from "cn"
import { Exit } from "effect"
import { ArrowDown, ArrowUp, Check } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Questionnaire,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
} from "@/components/ui/questionnaire"
import { decideConfirmationAtom } from "@/features/session/atoms"
import { describeCause } from "@/lib/errors"

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

const ROW =
  "flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left text-sm data-[active=true]:bg-accent"

const ACTION = "min-h-0"

const itemName = (index: number) => `question-${index}`

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
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("fieldset[data-active]")?.focus()
  }, [])

  const answers = collectAnswers(questions, drafts)

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

  const setDraft = (index: number, next: QuestionDraft) =>
    setDrafts((current) => current.map((existing, at) => (at === index ? next : existing)))

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement
    if (target instanceof HTMLInputElement && target.type === "text") return
    const options = questions[step]?.options.length ?? 0
    if (event.key !== String(options + 1)) return
    event.preventDefault()
    event.currentTarget
      .querySelector<HTMLInputElement>("fieldset[data-active] input[type=text]")
      ?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      {error !== undefined && <ErrorNote title="The answer was not sent" message={error} />}
      <Questionnaire
        ref={form}
        item={itemName(step)}
        onItemChange={(name) => {
          setStep(Number(name.slice("question-".length)))
          setActive(0)
        }}
        shortcuts="numbers"
        onKeyDown={onKeyDown}
        onSubmit={(event) => {
          event.preventDefault()
          if (answers !== undefined) void send({ decision: "allow", answers })
        }}
        className="gap-0 rounded-2xl border border-border/60 bg-muted shadow-xs outline-none"
      >
        {questions.map((question, index) => {
          const draft = drafts[index] ?? EMPTY_QUESTION_DRAFT
          const multi = question.multiSelect === true
          const answered = answerFor(question, draft) !== ""
          const last = index === questions.length - 1
          const isActive = (row: number) => index === step && active === row
          return (
            <QuestionnaireItem
              key={itemName(index)}
              name={itemName(index)}
              multiple={multi}
              required
              aria-label={`The agent asks: ${question.question}`}
              className="gap-0"
            >
              <QuestionnairePrimitive.Title className="flex w-full items-start gap-2 px-4 py-2.5 text-sm">
                {question.header !== undefined && question.header !== "" && (
                  <Badge variant="secondary" className="mt-px shrink-0">
                    {question.header}
                  </Badge>
                )}
                <span className="min-w-0 flex-1 font-medium">{question.question}</span>
                {questions.length > 1 && (
                  <QuestionnaireProgress className="min-h-0 min-w-0 shrink-0 font-normal">
                    {index + 1} of {questions.length}
                  </QuestionnaireProgress>
                )}
              </QuestionnairePrimitive.Title>
              <div className="rounded-2xl border border-border/60 bg-card p-2">
                {multi && (
                  <p className="px-2 pb-1 text-xs text-muted-foreground">Pick all that apply.</p>
                )}
                <QuestionnaireChoices className="flex flex-col gap-0">
                  {question.options.map((option, at) => {
                    const chosen = draft.selected.includes(option.label)
                    return (
                      <QuestionnairePrimitive.Choice
                        key={option.label}
                        value={option.label}
                        checked={chosen}
                        onChange={() =>
                          setDraft(index, toggleOption(question, draft, option.label))
                        }
                        data-active={isActive(at)}
                        onMouseMove={() => setActive(at)}
                        className={cn(ROW, "relative")}
                      >
                        <QuestionnairePrimitive.ChoiceInput
                          onFocus={() => setActive(at)}
                          className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                        />
                        <RowMark index={at} chosen={chosen} multi={multi} />
                        <QuestionnairePrimitive.ChoiceLabel className="min-w-0">
                          <span className="mr-2 font-medium">{option.label}</span>
                          {option.description !== undefined && (
                            <span className="text-muted-foreground">{option.description}</span>
                          )}
                        </QuestionnairePrimitive.ChoiceLabel>
                      </QuestionnairePrimitive.Choice>
                    )
                  })}
                  <div
                    data-active={isActive(question.options.length)}
                    onMouseMove={() => setActive(question.options.length)}
                    className={cn(ROW, "items-center")}
                  >
                    <RowMark
                      index={question.options.length}
                      chosen={draft.own.trim() !== ""}
                      multi={multi}
                    />
                    <QuestionnairePrimitive.Input
                      value={draft.own}
                      onChange={(event) =>
                        setDraft(index, typeOwnAnswer(question, draft, event.target.value))
                      }
                      onFocus={() => setActive(question.options.length)}
                      placeholder="Type your own"
                      aria-label="Your own answer"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </QuestionnaireChoices>
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
                  <div className="ml-auto flex items-center gap-1">
                    <QuestionnairePrevious
                      variant="ghost"
                      size="sm"
                      className={ACTION}
                      disabled={pending}
                    >
                      Back
                    </QuestionnairePrevious>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void send({ decision: "deny" })}
                      disabled={pending}
                      title="Skip and discuss it in the chat"
                    >
                      Talk about it
                    </Button>
                    {last ? (
                      <QuestionnaireSubmit
                        size="sm"
                        className={ACTION}
                        disabled={pending || answers === undefined}
                      >
                        Submit
                      </QuestionnaireSubmit>
                    ) : (
                      <QuestionnaireNext
                        size="sm"
                        className={ACTION}
                        disabled={pending || !answered}
                      >
                        Next
                      </QuestionnaireNext>
                    )}
                  </div>
                </div>
              </div>
            </QuestionnaireItem>
          )
        })}
      </Questionnaire>
    </div>
  )
}
