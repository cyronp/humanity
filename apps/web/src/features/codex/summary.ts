import type { CodexStatus } from "@humanity/contracts"

export interface CodexSummary {
  readonly tone: "ok" | "warning" | "error"
  /** One sentence for headings. */
  readonly title: string
  /** What it means for the threads that run on Codex. */
  readonly detail: string
}

export const summarizeCodex = (status: CodexStatus): CodexSummary => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      return connection.method === "chatgpt"
        ? {
            tone: "ok",
            title: "Connected to your ChatGPT account",
            detail: "Threads run on this plan, exactly like Codex in a terminal.",
          }
        : {
            tone: "ok",
            title:
              connection.method === "apiKey"
                ? "Connected with an OpenAI API key"
                : `Connected through ${connection.label}`,
            detail: "Threads run on this credential. Usage is billed to it, not to a ChatGPT plan.",
          }
    case "SignedOut":
      return {
        tone: "warning",
        title: "Codex is not signed in",
        detail: "Sign in once with Codex. Humanity picks the login up automatically.",
      }
    case "Unavailable":
      return {
        tone: "error",
        title: "Codex could not be started",
        detail: "Humanity runs the Codex CLI that ships with it, and it did not start.",
      }
  }
}

const quote = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value)

/**
 * The command that signs Codex in, with the executable Humanity itself runs,
 * so the login lands where its threads will read it.
 */
export const codexSignInCommand = (executable: string): string => `${quote(executable)} login`
