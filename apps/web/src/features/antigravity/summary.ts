import type { AntigravityStatus } from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

export const antigravityLine = (status: AntigravityStatus): string => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      return connection.label
    case "SignedOut":
      return "Antigravity is not signed in"
    case "Unavailable":
      return "Antigravity could not be started"
  }
}

export const antigravityTitle = (status: AntigravityStatus): string =>
  status.connection._tag === "Connected"
    ? "Connected to your Google account"
    : antigravityLine(status)

export const antigravitySignInUsesPowerShell = (options: {
  readonly geminiHome: string | null
  readonly executable: string
}): boolean =>
  isWindowsPath(options.executable) ||
  (options.geminiHome !== null && isWindowsPath(options.geminiHome))

export const antigravitySignInCommand = (options: {
  readonly geminiHome: string | null
  readonly executable: string
}): string => {
  const { geminiHome, executable } = options
  const login = `${callExecutable(executable)} acp --login`
  if (geminiHome === null) return login
  return isWindowsPath(geminiHome)
    ? `$env:GEMINI_HOME = ${quotePowerShell(geminiHome)}; $env:AGY_ACP_FORCE_FILE_STORAGE = '1'; ${login}; Remove-Item Env:GEMINI_HOME, Env:AGY_ACP_FORCE_FILE_STORAGE`
    : `GEMINI_HOME=${quotePosix(geminiHome)} AGY_ACP_FORCE_FILE_STORAGE=1 ${login}`
}
