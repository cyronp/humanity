import { describe, expect, it } from "vitest"
import {
  answerFor,
  collectAnswers,
  EMPTY_QUESTION_DRAFT,
  parseQuestions,
  type Question,
  QUESTION_TOOL,
  toggleOption,
  toolMode,
  typeOwnAnswer,
} from "../src/index.ts"

const single: Question = {
  question: "Which library should we use?",
  header: "Library",
  options: [
    { label: "date-fns", description: "Small and tree-shakeable" },
    { label: "Luxon", description: "Time zones built in" },
  ],
  multiSelect: false,
}

const multi: Question = {
  question: "Which sections do you want?",
  options: [{ label: "Introduction" }, { label: "Usage" }, { label: "Conclusion" }],
  multiSelect: true,
}

describe("parseQuestions", () => {
  it("reads the questions of an AskUserQuestion input", () => {
    expect(parseQuestions({ questions: [single, multi] })).toEqual([single, multi])
  })

  it("rejects anything that is not a list of questions", () => {
    expect(parseQuestions({ command: "ls" })).toBeUndefined()
    expect(parseQuestions({ questions: [] })).toBeUndefined()
    expect(parseQuestions({ questions: [{ question: "No options?" }] })).toBeUndefined()
    expect(parseQuestions(null)).toBeUndefined()
  })
})

describe("answering a question", () => {
  it("keeps one option for a single-select question", () => {
    const first = toggleOption(single, EMPTY_QUESTION_DRAFT, "date-fns")
    const second = toggleOption(single, first, "Luxon")
    expect(answerFor(single, second)).toBe("Luxon")
  })

  it("lets an own answer and an option replace each other in a single-select question", () => {
    const picked = toggleOption(single, EMPTY_QUESTION_DRAFT, "Luxon")
    const typed = typeOwnAnswer(single, picked, "  Temporal, natively  ")
    expect(answerFor(single, typed)).toBe("Temporal, natively")
    expect(answerFor(single, toggleOption(single, typed, "date-fns"))).toBe("date-fns")
    // Clearing the field does not throw the picked option away.
    expect(answerFor(single, typeOwnAnswer(single, picked, ""))).toBe("Luxon")
  })

  it("joins a multi-select answer in the agent's order, with the own answer last", () => {
    let draft = toggleOption(multi, EMPTY_QUESTION_DRAFT, "Conclusion")
    draft = toggleOption(multi, draft, "Introduction")
    expect(answerFor(multi, draft)).toBe("Introduction, Conclusion")
    draft = typeOwnAnswer(multi, draft, "A changelog")
    expect(answerFor(multi, draft)).toBe("Introduction, Conclusion, A changelog")
    expect(answerFor(multi, toggleOption(multi, draft, "Conclusion"))).toBe(
      "Introduction, A changelog",
    )
  })

  it("has answers only once every question is answered", () => {
    const picked = toggleOption(single, EMPTY_QUESTION_DRAFT, "Luxon")
    expect(collectAnswers([single, multi], [picked, EMPTY_QUESTION_DRAFT])).toBeUndefined()
    expect(
      collectAnswers([single, multi], [picked, toggleOption(multi, EMPTY_QUESTION_DRAFT, "Usage")]),
    ).toEqual({
      "Which library should we use?": "Luxon",
      "Which sections do you want?": "Usage",
    })
  })
})

describe("the question tool's mode", () => {
  it("is always something for the human to answer", () => {
    expect(toolMode(QUESTION_TOOL)).toBe("confirm")
  })
})
