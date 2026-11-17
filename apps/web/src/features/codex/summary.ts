import type { CodexStatus } from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

export interface CodexSummary {
  readonly title: string
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

export const codexLine = (status: CodexStatus): string => {
  const connection = status.connection
  if (connection._tag !== "Connected") return summarizeCodex(status).title
  return connection.email === null ? connection.label : `${connection.label} · ${connection.email}`
}

export const codexSignInUsesPowerShell = (options: {
  readonly codexHome: string | null
  readonly executable: string
}): boolean =>
  isWindowsPath(options.executable) ||
  (options.codexHome !== null && isWindowsPath(options.codexHome))

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
