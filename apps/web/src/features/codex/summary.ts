import type { CodexStatus } from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

export interface CodexSummary {
  /** One sentence for headings. */
  readonly title: string
  /** What it means for the threads that run on Codex. */
  readonly detail: string | null
}

export const summarizeCodex = (status: CodexStatus): CodexSummary => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      return connection.method === "chatgpt"
        ? {
            title: "Connected to your ChatGPT account",
            detail: null,
          }
        : {
            title:
              connection.method === "apiKey"
                ? "Connected with an OpenAI API key"
                : `Connected through ${connection.label}`,
            detail: "Billed to this credential, not to a ChatGPT plan.",
          }
    case "SignedOut":
      return {
        title: "Codex is not signed in",
        detail: null,
      }
    case "Unavailable":
      return {
        title: "Codex could not be started",
        detail: null,
      }
  }
}

/** One line about a Codex login: the plan and who is signed in, or what is wrong. */
export const codexLine = (status: CodexStatus): string => {
  const connection = status.connection
  if (connection._tag !== "Connected") return summarizeCodex(status).title
  return connection.email === null ? connection.label : `${connection.label} · ${connection.email}`
}

/** True when the sign-in command is PowerShell's: the executable or the folder is a Windows path. */
export const codexSignInUsesPowerShell = (options: {
  readonly codexHome: string | null
  readonly executable: string
}): boolean =>
  isWindowsPath(options.executable) ||
  (options.codexHome !== null && isWindowsPath(options.codexHome))

/**
 * The command that signs an account in, with the executable Humanity itself
 * runs. `codexHome` is the folder of an added account (`null` for Codex's
 * default login), set only for the login so the default one is left alone. A
 * Windows path gets a PowerShell command, the default shell there.
 */
export const codexSignInCommand = (options: {
  readonly codexHome: string | null
  readonly executable: string
}): string => {
  const { codexHome, executable } = options
  const login = `${callExecutable(executable)} login`
  if (codexHome === null) return login
  return isWindowsPath(codexHome)
    ? `$env:CODEX_HOME = ${quotePowerShell(codexHome)}; ${login}; Remove-Item Env:CODEX_HOME`
    : `CODEX_HOME=${quotePosix(codexHome)} ${login}`
}
