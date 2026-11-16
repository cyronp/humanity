/** True for a path of Windows: one that starts at a drive (`C:\`) or at a share (`\\host`). */
export const isWindowsPath = (value: string): boolean => /^(?:[a-z]:[\\/]|\\\\)/i.test(value)

/**
 * A value as one word of a POSIX shell command. Single quotes, inside which a
 * shell reads every character as itself; a single quote in the value closes
 * them, is written escaped, and opens them again.
 */
export const quotePosix = (value: string): string =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`

/**
 * A value as a PowerShell string. Single quotes, inside which PowerShell
 * expands nothing; a single quote in the value is written twice.
 */
export const quotePowerShell = (value: string): string => `'${value.replaceAll("'", "''")}'`

/**
 * An executable as the start of a command someone pastes in a terminal. A
 * Windows path gets PowerShell's call operator, the default shell there,
 * which is what runs a quoted path.
 */
export const callExecutable = (executable: string): string =>
  isWindowsPath(executable) ? `& ${quotePowerShell(executable)}` : quotePosix(executable)
