import { type Approval, QUESTION_TOOL } from "@humanity/contracts"

/** One sentence for a human decision. */
export const describeDecision = (approval: Approval): string => {
  if (approval._tag === "confirmation") {
    const { status, toolName } = approval.confirmation
    if (toolName === QUESTION_TOOL) {
      if (status === "allowed") return "You answered the agent's question"
      if (status === "denied") return "You chose to talk about the agent's question"
      return "The agent's question expired"
    }
    if (status === "allowed") return `You allowed ${toolName}`
    if (status === "denied") return `You denied ${toolName}`
    return `${toolName} request expired`
  }
  const { status, filePath, hunks } = approval.change
  const approved = hunks.filter((hunk) => hunk.status === "approved").length
  switch (status) {
    case "applied":
      return `You allowed the change to ${filePath}`
    // Only on changes from when hunks were decided one by one.
    case "partially_applied":
      return `You approved ${approved} of ${hunks.length} hunks of ${filePath}`
    case "rejected":
      return `You denied the change to ${filePath}`
    case "expired":
      return `The change to ${filePath} expired`
    case "pending":
      return `Waiting for you to allow the change to ${filePath}`
  }
}
