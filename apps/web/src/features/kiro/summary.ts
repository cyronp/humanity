import type { KiroStatus } from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

export const kiroLine = (status: KiroStatus): string => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected":
      return connection.label
    case "SignedOut":
      return "Kiro is not signed in"
    case "Unavailable":
      return "Kiro could not be started"
  }
}

export const kiroTitle = (status: KiroStatus): string =>
  status.connection._tag === "Connected" ? "Connected to your Kiro account" : kiroLine(status)

export const kiroSignInUsesPowerShell = (options: {
  readonly kiroHome: string | null
  readonly executable: string
}): boolean =>
  isWindowsPath(options.executable) ||
  (options.kiroHome !== null && isWindowsPath(options.kiroHome))

export const kiroSignInCommand = (options: {
  readonly kiroHome: string | null
  readonly executable: string
}): string => {
  const { kiroHome, executable } = options
  const login = `${callExecutable(executable)} login`
  if (kiroHome === null) return login
  return isWindowsPath(kiroHome)
    ? `$env:KIRO_HOME = ${quotePowerShell(kiroHome)}; ${login}; Remove-Item Env:KIRO_HOME`
    : `KIRO_HOME=${quotePosix(kiroHome)} ${login}`
}
