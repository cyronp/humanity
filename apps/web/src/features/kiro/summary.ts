import type { KiroStatus } from "@humanity/contracts"
import { callExecutable, isWindowsPath, quotePosix, quotePowerShell } from "@/lib/shell"

/** One line about a Kiro login: what the CLI says of it, or what is wrong. */
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

/** A heading for a Kiro login's state. */
export const kiroTitle = (status: KiroStatus): string =>
  status.connection._tag === "Connected" ? "Connected to your Kiro account" : kiroLine(status)

/** True when the sign-in command is PowerShell's: the executable or the folder is a Windows path. */
export const kiroSignInUsesPowerShell = (options: {
  readonly kiroHome: string | null
  readonly executable: string
}): boolean =>
  isWindowsPath(options.executable) ||
  (options.kiroHome !== null && isWindowsPath(options.kiroHome))

/**
 * The command that signs an account in. `kiroHome` is the folder of an added
 * account (`null` for Kiro's default login), set only for the login so the
 * default one is left alone.
 */
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
