import type { CodexStatus } from "@humanity/contracts"
import { callExecutable } from "@/lib/shell"

export interface CodexSummary {
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
            title: "Connected to your ChatGPT account",
            detail: "Threads run on this plan, exactly like Codex in a terminal.",
          }
        : {
            title:
              connection.method === "apiKey"
                ? "Connected with an OpenAI API key"
                : `Connected through ${connection.label}`,
            detail: "Threads run on this credential. Usage is billed to it, not to a ChatGPT plan.",
          }
    case "SignedOut":
      return {
        title: "Codex is not signed in",
        detail: "Sign in once with Codex. Humanity picks the login up automatically.",
      }
    case "Unavailable":
      return {
        title: "Codex could not be started",
        detail: "Humanity runs the Codex CLI that ships with it, and it did not start.",
      }
  }
}

/**
 * The command that signs Codex in, with the executable Humanity itself runs,
 * so the login lands where its threads will read it. A Windows path gets a
 * PowerShell command, the default shell there.
 */
export const codexSignInCommand = (executable: string): string =>
  `${callExecutable(executable)} login`
