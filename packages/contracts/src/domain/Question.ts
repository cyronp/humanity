import { Option, Schema } from "effect"

/**
 * The agent's tool for asking the human to choose between options. It is not
 * allowed or denied like other tools: it is answered, and the answers go back
 * to the agent as the tool's input.
 */
export const QUESTION_TOOL = "AskUserQuestion"

export const QuestionOption = Schema.Struct({
  label: Schema.String,
  description: Schema.optional(Schema.String),
})
export type QuestionOption = typeof QuestionOption.Type

export const Question = Schema.Struct({
  /** The full question. Also the key of its answer. */
  question: Schema.String,
  /** A short label for the question, such as "Auth method". */
  header: Schema.optional(Schema.String),
  options: Schema.Array(QuestionOption),
  multiSelect: Schema.optional(Schema.Boolean),
})
export type Question = typeof Question.Type

/** Question text to answer: an option's label, several joined with ", ", or the human's own words. */
export const QuestionAnswers = Schema.Record(Schema.String, Schema.String)
export type QuestionAnswers = typeof QuestionAnswers.Type

const QuestionInput = Schema.Struct({ questions: Schema.NonEmptyArray(Question) })
const decodeQuestionInput = Schema.decodeUnknownOption(QuestionInput)

/** The questions of an `AskUserQuestion` call, or `undefined` if the input is not one. */
export const parseQuestions = (input: unknown): ReadonlyArray<Question> | undefined =>
  Option.getOrUndefined(Option.map(decodeQuestionInput(input), (decoded) => decoded.questions))

/** What the human picked for one question, before it becomes an answer. */
export interface QuestionDraft {
  /** Labels of the chosen options: at most one unless the question is multi-select. */
  readonly selected: ReadonlyArray<string>
  /** The human's own answer, typed instead of (or, for multi-select, besides) an option. */
  readonly own: string
}

export const EMPTY_QUESTION_DRAFT: QuestionDraft = { selected: [], own: "" }

/** Picks an option: it replaces the answer of a single-select question and toggles in a multi-select one. */
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

/** Types an own answer, which replaces the chosen option of a single-select question. */
export const typeOwnAnswer = (
  question: Question,
  draft: QuestionDraft,
  own: string,
): QuestionDraft =>
  question.multiSelect === true || own.trim() === "" ? { ...draft, own } : { selected: [], own }

/** The answer the agent receives for one question; `""` while it is unanswered. */
export const answerFor = (question: Question, draft: QuestionDraft): string => {
  const own = draft.own.trim()
  // In the order the agent listed them, not the order they were clicked.
  const labels = question.options
    .map((option) => option.label)
    .filter((label) => draft.selected.includes(label))
  if (question.multiSelect === true) return [...labels, ...(own === "" ? [] : [own])].join(", ")
  return labels[0] ?? own
}

/** Every question's answer, or `undefined` while one of them is unanswered. */
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

/** What the agent is told when the human would rather talk than pick an option. */
export const TALK_ABOUT_IT_MESSAGE =
  "The human did not pick an option: they want to talk this over in the chat first. Do not ask again with AskUserQuestion. Briefly say you are listening and wait for their next message."
