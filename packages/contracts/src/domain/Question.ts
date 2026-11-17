import { Option, Schema } from "effect"

export const QUESTION_TOOL = "AskUserQuestion"

export const QuestionOption = Schema.Struct({
  label: Schema.String,
  description: Schema.optional(Schema.String),
})
export type QuestionOption = typeof QuestionOption.Type

export const Question = Schema.Struct({
  question: Schema.String,
  header: Schema.optional(Schema.String),
  options: Schema.Array(QuestionOption),
  multiSelect: Schema.optional(Schema.Boolean),
})
export type Question = typeof Question.Type

export const QuestionAnswers = Schema.Record(Schema.String, Schema.String)
export type QuestionAnswers = typeof QuestionAnswers.Type

const QuestionInput = Schema.Struct({ questions: Schema.NonEmptyArray(Question) })
const decodeQuestionInput = Schema.decodeUnknownOption(QuestionInput)

export const parseQuestions = (input: unknown): ReadonlyArray<Question> | undefined =>
  Option.getOrUndefined(Option.map(decodeQuestionInput(input), (decoded) => decoded.questions))

export interface QuestionDraft {
  readonly selected: ReadonlyArray<string>
  readonly own: string
}

export const EMPTY_QUESTION_DRAFT: QuestionDraft = { selected: [], own: "" }

export const toggleOption = (
  question: Question,
  draft: QuestionDraft,
  label: string,
): QuestionDraft => {
  if (question.multiSelect !== true) return { selected: [label], own: "" }
  return {
    ...draft,
    selected: draft.selected.includes(label)
      ? draft.selected.filter((selected) => selected !== label)
      : [...draft.selected, label],
  }
}

export const typeOwnAnswer = (
  question: Question,
  draft: QuestionDraft,
  own: string,
): QuestionDraft =>
  question.multiSelect === true || own.trim() === "" ? { ...draft, own } : { selected: [], own }

export const answerFor = (question: Question, draft: QuestionDraft): string => {
  const own = draft.own.trim()
  const labels = question.options
    .map((option) => option.label)
    .filter((label) => draft.selected.includes(label))
  if (question.multiSelect === true) return [...labels, ...(own === "" ? [] : [own])].join(", ")
  return labels[0] ?? own
}

export const collectAnswers = (
  questions: ReadonlyArray<Question>,
  drafts: ReadonlyArray<QuestionDraft>,
): QuestionAnswers | undefined => {
  const answers: Record<string, string> = {}
  for (const [index, question] of questions.entries()) {
    const answer = answerFor(question, drafts[index] ?? EMPTY_QUESTION_DRAFT)
    if (answer === "") return undefined
    answers[question.question] = answer
  }
  return answers
}

export const TALK_ABOUT_IT_MESSAGE =
  "The human did not pick an option: they want to talk this over in the chat first. Do not ask again with AskUserQuestion. Briefly say you are listening and wait for their next message."
